-- MHDPS 0.1.4: passive Wilds telemetry; never modifies game values.
if _G.MHDPS_STANDALONE then return _G.MHDPS_STANDALONE end
local S={status='idle',seconds=0,players={},hunters={},enemies={},hooks={},errors={},seq=0,session=tostring(os.time())}
_G.MHDPS_STANDALONE=S
local weapons={[0]='GreatSword','SwordAndShield','DualBlades','LongSword','Hammer','HuntingHorn','Lance','Gunlance','SwitchAxe','ChargeBlade','InsectGlaive','Bow','HeavyBowgun','LightBowgun'}
local function call(o,m,...)
    if not o then return end
    local ok,v=pcall(o.call,o,m,...); if ok then return v end
end
local function field(o,k)
    if not o then return end
    local ok,v=pcall(o.get_field,o,k); if ok then return v end
end
local function addr(o) return o and o:get_address() end
local function report(k,e)
    e=tostring(e); if S.errors[k]~=e then log.error('[MHDPS] '..k..': '..e) end; S.errors[k]=e
end
local function hook(c,m,fn,required)
    local t=sdk.find_type_definition(c); local method=t and t:get_method(m); local k=c..'.'..m
    S.hooks[k]=method~=nil
    if not method then if required then report(k,'SDK method missing') end; return end
    sdk.hook(method,function(args) local ok,e=pcall(fn,args); if not ok then report(k,e) end end,function(ret) return ret end)
end
local function begin_quest()
    if S.status=='in_progress' then return end
    S.seq=S.seq+1; S.questId=S.session..':'..S.seq
    S.status,S.seconds,S.players,S.target='in_progress',0,{},nil
end
local function sync_quest()
    local mgr=sdk.get_managed_singleton('app.MissionManager')
    local playing=call(mgr,'get_IsPlayingQuest')
    if playing==nil then return end
    if playing and (S.lastPlaying==false or S.status=='idle') then begin_quest() end
    S.lastPlaying=playing
    if not playing and S.status=='in_progress' then S.status='ended' end
    if playing then
        local seconds=call(call(mgr,'get_QuestDirector'),'get_QuestElapsedTime')
        if type(seconds)=='number' and seconds>=0 then S.seconds=seconds end
    end
end
hook('app.cQuestPlaying','enter()',begin_quest,true)
hook('app.cQuestPlaying','exit()',function() if S.status=='in_progress' then S.status='ended' end end,true)
hook('app.cQuestSuccessFreePlayTime','enter()',function() S.status='completed' end,false)
hook('app.cQuestFailed','enter()',function() S.status='failed' end,false)
hook('app.cQuestCancel','enter()',function() S.status='aborted' end,false)
hook('app.cQuestClearEnd','enter()',function() S.status='completed' end,false)
local function hunter_update(hunter)
    if not hunter then return end
    local id=tostring(addr(hunter)); local h=S.hunters[id] or {id=id}
    h.seen=os.clock()
    if h.updated and h.seen-h.updated<0.5 then return h end
    h.updated=h.seen; h.isSelf=call(hunter,'get_IsMaster')==true and call(hunter,'get_IsUserControl')==true
    h.weapon=call(hunter,'get_WeaponType'); h.reserve=call(hunter,'get_ReserveWeaponType')
    h.go=addr(call(hunter,'get_GameObject'))
    local ex=call(hunter,'get_HunterExtend'); h.npc=call(ex,'get_IsNpc')==true
    if h.npc then
        local npcId=call(ex,'get_NpcID') or call(ex,'get_NpcId') or field(ex,'_NpcID')
        local kind=sdk.find_type_definition('app.NpcUtil')
        local method=kind and kind:get_method('getNpcName(app.NpcDef.ID)')
        if method and npcId then
            local ok,name=pcall(function() return method:call(nil,npcId) end)
            if ok and type(name)=='string' then h.name=name end
        end
    end
    -- Noncombat characters have no supported weapon. NPC Alma is never a row.
    h.excluded=not weapons[h.weapon] or (h.npc and h.name and h.name:lower():match('^%s*alma%s*$')~=nil)
    if h.excluded then S.players[id]=nil end
    local indices=call(ex,'get_MemberIndex') or call(hunter,'get_MemberIndex')
    if indices then
        local ok,v=pcall(function() return indices:get_element(S.questSession or 2) end)
        h.member=ok and v or call(indices,'get_Item',S.questSession or 2)
    end
    S.hunters[id]=h; return h
end
hook('app.HunterCharacter','doUpdateEnd',function(a) hunter_update(sdk.to_managed_object(a[2])) end,true)
hook('app.HunterCharacter','doOnDestroy',function(a) local h=sdk.to_managed_object(a[2]); if h then S.hunters[tostring(addr(h))]=nil end end,false)
-- Resolve compiler-generated backing fields from SDK metadata.
local maps={}
local function named(o,names)
    if not o then return end
    local t=o:get_type_definition(); local tn=t:get_full_name()
    if not maps[tn] then
        maps[tn]={}
        for _,f in ipairs(t:get_fields()) do maps[tn][f:get_name():lower():gsub('[^%w]',''):gsub('kbackingfield$','')]=f:get_name() end
    end
    for _,n in ipairs(names) do
        local wanted=n:lower(); local k=maps[tn][wanted]
        if not k then
            for canonical,original in pairs(maps[tn]) do
                if canonical:match('^'..wanted..'%d*$') or canonical=='m'..wanted then k=original;break end
            end
        end
        if k then local v=field(o,k); if v~=nil then return v end end
    end
end
local function roster()
    local t=sdk.find_type_definition('app.net_session_manager.SESSION_TYPE')
    if t and not S.questSession then for _,f in ipairs(t:get_fields()) do
        if f:is_static() and f:get_name():upper()=='QUEST' then S.questSession=f:get_data(nil) end
    end end
    local net=sdk.get_managed_singleton('app.NetworkManager')
    local mgr=call(net,'get_UserInfoManager')
    local list=field(call(mgr,'getUserInfoList',S.questSession or 2),'_ListInfo'); local out={}
    if not list then return out end
    local ok,count=pcall(function() return list:get_size() end)
    if not ok then count=call(list,'get_Count') or 0 end
    for i=0,math.min(count,16)-1 do
        local good,info=pcall(function() return list:get_element(i) end)
        if not good then info=call(list,'get_Item',i) end
        if info and named(info,{'IsValid'})~=false then
            local p=named(info,{'Param','UserParam','NetUserParam'})
            if not p then
                -- Field type is more stable than an obfuscated/backing field name.
                for _,f in ipairs(info:get_type_definition():get_fields()) do
                    local ok,kind=pcall(function() return f:get_type():get_full_name() end)
                    if ok and kind=='app.Net_UserParam' then p=field(info,f:get_name());break end
                end
            end
            -- Empty network slots have no parameter block. Never invoke their
            -- native name getter: the engine can throw before Lua can recover.
            local name=p and named(p,{'PlName','PlayerName'})
            if type(name)=='string' and name~='' then out[#out+1]={name=name,hr=named(p,{'HunterRank','HR'}),
                isSelf=named(info,{'IsSelf'})==true,
                member=named(info,{'MemberIndex'}) or i,weapon=named(p,{'WeaponType'}),reserve=named(p,{'ReserveWeaponType'})} end
        end
    end
    return out
end
local function player(h)
    local p=S.players[h.id]
    if not p then
        p={id=h.id,name=h.name or (h.isSelf and 'Du' or (h.npc and 'Support-Jaeger ' or 'Jaeger ')..h.id:sub(-4)),
            damage=0,highestHit=0,monsterHits=0,details={},isSelf=h.isSelf}
        S.players[h.id]=p
    end
    p.weapon=weapons[h.weapon] or 'Unknown'; return p
end
-- Read-only SDK access: cEnemyContext.Parts -> cEmModuleParts.DmgParts.
-- Each cDamageParts inherits cValueHolderF_R (current and maximum durability).
local function array_item(list,i)
    if not list then return end
    local ok,v=pcall(function() return list:get_element(i) end)
    if ok then return v end
    return call(list,'get_Item',i)
end
local function read_parts(em)
    local module=call(em,'get_Parts')
    local list=call(module,'get_DmgParts') or field(module,'_DmgParts')
    local count=call(module,'get_DmgPartsNum')
    if type(count)~='number' then return end
    local result={}
    for i=0,math.min(count,64)-1 do
        local part=array_item(list,i)
        local hp=call(part,'get_Value') or field(part,'_Value')
        local max=call(part,'get_MaxValue') or field(part,'_MaxValue')
        local valid=call(part,'get_ValidPartsVital')
        if valid~=false and call(part,'get_IsEnable')~=false and type(hp)=='number' and type(max)=='number' and max>0 then
            result[#result+1]={id=tostring(i+1),kind='durability',hp=math.max(0,hp),maxHp=max}
        end
    end
    return result
end
local function enemy_update(enemy)
    local ctx=field(enemy,'_Context'); local em=call(ctx,'get_Em') or field(ctx,'_Em')
    if call(em,'get_IsBoss')~=true then return end
    local go=addr(call(enemy,'get_GameObject')); if not go then return end
    local health=call(call(ctx,'get_Chara'),'get_HealthManager'); local e=S.enemies[go] or {}
    e.hp,e.maxHp=call(health,'get_Health'),call(health,'get_MaxHealth'); e.seen=os.clock()
    if not e.partsAt or e.seen-e.partsAt>=0.5 then
        local ok,parts=pcall(read_parts,em);e.parts=ok and parts or nil;e.partsAt=e.seen
    end
    if not e.name then
        local id=call(em,'get_EmID'); local t=sdk.find_type_definition('app.EnemyDef')
        local method=t and t:get_method('EnemyName(app.EnemyDef.ID)')
        local guid=method and method:call(nil,id); local msg=sdk.find_type_definition('via.gui.message')
        e.name=guid and msg:get_method('get(System.Guid)'):call(nil,guid) or 'Grossmonster'
    end
    S.enemies[go]=e
end
hook('app.EnemyCharacter','doUpdateEnd',function(a) enemy_update(sdk.to_managed_object(a[2])) end,true)
local seen={}
local companions={}
local function hit(h,info,source)
    sync_quest(); if S.status~='in_progress' or not h or h.excluded or not info then return end
    local target=S.enemies[addr(call(info,'get_DamageOwner'))]; if not target then return end
    local damage=field(call(info,'get_DamageData'),'FinalDamage')
    if type(damage)~='number' or damage<=0 or damage~=damage then return end
    local key=h.id..':'..tostring(addr(call(info,'get_DamageOwner')))..':'..tostring(addr(info))..':'..tostring(damage); local now=os.clock(); local prev=seen[key]
    -- Equal multi-hits from one hook are valid; only suppress cross-hook duplicates.
    if prev and prev.source~=source and now-prev.time<0.05 then return end
    seen[key]={source=source,time=now}
    local p=player(h); p.damage=p.damage+damage; p.monsterHits=p.monsterHits+1
    p.highestHit=math.max(p.highestHit,damage); S.target=target
    if source=='palico' or source=='palico-shell' then p.details.companionDamage=(p.details.companionDamage or 0)+damage end
end
hook('app.HunterCharacter','evHit_AttackPostProcess(app.HitInfo)',function(a)
    hit(hunter_update(sdk.to_managed_object(a[2])),sdk.to_managed_object(a[3]),'hunter')
end,true)
hook('app.mcShellColHit','evAttackPostProcess(app.HitInfo)',function(a)
    local info=sdk.to_managed_object(a[3]); local owner=addr(call(info,'getActualAttackOwner') or field(info,'<AttackOwner>k__BackingField'))
    for _,h in pairs(S.hunters) do if h.go==owner then hit(h,info,'shell'); return end end
    local companion=companions[owner]; if companion then hit(companion,info,'palico-shell') end
end,true)
hook('app.Wp10Insect','evAttackPostProcess(app.HitInfo)',function(a)
    hit(hunter_update(call(sdk.to_managed_object(a[2]),'get_Hunter')),sdk.to_managed_object(a[3]),'insect')
end,false)
-- Palico damage belongs to the owner returned by the game, never inferred by name.
hook('app.OtomoCharacter','doUpdateEnd',function(a)
    local otomo=sdk.to_managed_object(a[2])
    local owner=hunter_update(call(otomo,'get_OwnerHunterCharacter'))
    local go=addr(call(otomo,'get_GameObject'))
    if go then companions[go]=owner end
end,false)
hook('app.OtomoCharacter','doOnDestroy',function(a)
    local go=addr(call(sdk.to_managed_object(a[2]),'get_GameObject'))
    if go then companions[go]=nil end
end,false)
hook('app.OtomoCharacter','evHit_AttackPostProcess(app.HitInfo)',function(a)
    hit(hunter_update(call(sdk.to_managed_object(a[2]),'get_OwnerHunterCharacter')),sdk.to_managed_object(a[3]),'palico')
end,false)
local last=-1
local function quest_target()
    local t=sdk.find_type_definition('app.QuestUtil')
    local method=t and t:get_method('getActiveQuestTargetBossList()')
    if not method then return end
    local list=method:call(nil)
    if (call(list,'get_Count') or 0)<1 then return end
    local key=call(list,'get_Item',0)
    local resolver=sdk.find_type_definition('app.TargetAccessKeyUtil')
    local resolve=resolver and resolver:get_method('getEnemyCharacter(app.TARGET_ACCESS_KEY, System.Boolean)')
    local enemy=resolve and resolve:call(nil,key,true)
    if enemy then enemy_update(enemy); S.target=S.enemies[addr(call(enemy,'get_GameObject'))] end
end
local function export()
    sync_quest(); local now=os.clock()
    for k,v in pairs(seen) do if now-v.time>1 then seen[k]=nil end end
    for k,v in pairs(S.enemies) do if now-(v.seen or now)>30 then S.enemies[k]=nil end end
    if S.status=='in_progress' and not S.target then pcall(quest_target) end
    local ok,members=pcall(roster)
    if not ok then report('roster',members); members={} end
    if S.status=='in_progress' then for _,h in pairs(S.hunters) do if now-h.seen<3 and not h.excluded and (not h.npc or (S.players[h.id] and S.players[h.id].damage>0)) then
        local p=player(h); local candidates={}
        for _,m in ipairs(members) do
            if not m.matched and h.isSelf==m.isSelf and not h.npc and (h.isSelf or h.weapon==m.weapon or h.weapon==m.reserve) then candidates[#candidates+1]=m end
        end
        local match=#candidates==1 and candidates[1] or nil
        if not match then for _,m in ipairs(candidates) do if m.member==h.member then match=m; break end end end
        if match then p.name,p.hr=match.name,match.hr; match.matched=true end
    end end end
    local players,total={},0; for _,p in pairs(S.players) do total=total+p.damage end
    for _,p in pairs(S.players) do p.dps=S.seconds>0 and p.damage/S.seconds or 0; p.damageShare=total>0 and p.damage/total*100 or 0; players[#players+1]=p end
    -- Include joining members before their character has spawned / dealt damage.
    if S.status=='in_progress' then for _,m in ipairs(members) do if not m.matched then
        players[#players+1]={id='member:'..m.member,name=m.name,hr=m.hr,isSelf=m.isSelf,weapon=weapons[m.weapon] or 'Unknown',damage=0,dps=0,damageShare=0,details={}}
    end end end
    local target=S.target; local hp=target and target.hp and target.maxHp and target.maxHp>0 and target.hp/target.maxHp*100 or nil
    local errors={}; for k,e in pairs(S.errors) do errors[#errors+1]=k..': '..e end
    json.dump_file('dps_live.json',{schemaVersion=1,source='mhdps-wilds',game='wilds',
        quest={id=S.questId,dpsBasis='quest-time',status=S.status,timeSeconds=S.seconds,monster=target and target.name or nil,monsterHpPercent=hp,monsterHp=target and target.hp,targetHp=target and target.maxHp,parts=target and target.parts},
        players=players,diagnostics={version='0.1.4',hooks=S.hooks,errors=errors,sessionMembers=#members}})
end
re.on_frame(function()
    if os.clock()-last<0.2 then return end; last=os.clock()
    local ok,e=pcall(export); if not ok then report('export',e) end
end)
re.on_draw_ui(function()
    if imgui.tree_node('MHDPS Combat Analytics') then
        imgui.text('MHDPS 0.1.4 | '..S.status..' | '..tostring(S.seconds)..' s')
        imgui.text('Export: reframework/data/dps_live.json')
        for k,v in pairs(S.hooks) do imgui.text((v and 'OK ' or 'MISSING ')..k) end
        for k,e in pairs(S.errors) do imgui.text(k..': '..e) end
        imgui.tree_pop()
    end
end)
log.info('[MHDPS] 0.1.4 loaded; Script Generated UI contains hook diagnostics')
return S
