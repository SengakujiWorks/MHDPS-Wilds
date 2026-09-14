import http from 'node:http';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const MAX_BODY = 128 * 1024;
const id = bytes => randomBytes(bytes).toString('base64url');
const number = (v, fallback = 0) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
const text = (v, max = 100) => typeof v === 'string' ? v.slice(0, max) : '';
const weapons = new Set(['GreatSword','SwordAndShield','DualBlades','LongSword','Hammer','HuntingHorn','Lance','Gunlance','SwitchAxe','ChargeBlade','InsectGlaive','Bow','HeavyBowgun','LightBowgun','Unknown']);
const detailNumbers = ['rawDamage','elementDamage','trueDamage','healingDone','knockouts','stuns','paralyze','sleep','woundsOpened','focusStrikes','companionDamage'];

// Export only dashboard data: no local file paths, SDK diagnostics or publisher secrets.
export function sanitizePacket(input) {
    if (!input || input.game !== 'wilds' || !input.quest || !Array.isArray(input.players) || input.players.length > 64) throw new Error('Invalid telemetry');
    const q = input.quest;
    if (!['idle','in_progress','completed','ended','failed','aborted'].includes(q.status)) throw new Error('Invalid quest');
    return {game:'wilds', quest:{id:text(q.id), status:q.status, timeSeconds:number(q.timeSeconds),
        monster:text(q.monster), monsterHpPercent:q.monsterHpPercent == null ? null : Math.min(100,number(q.monsterHpPercent)), targetHp:number(q.targetHp,null), monsterHp:number(q.monsterHp,null),
        parts:(Array.isArray(q.parts) ? q.parts : []).slice(0,64).filter(p=>p && typeof p==='object').map(p=>({
            id:text(String(p.id ?? ''),40),name:text(p.name,80),kind:['break','sever','durability'].includes(p.kind)?p.kind:'durability',
            hp:number(p.hp,null),maxHp:number(p.maxHp,null)})),
        dpsBasis:q.dpsBasis === 'tdm-active-combat' ? q.dpsBasis : 'quest-time',combatTimeSeconds:number(q.combatTimeSeconds)},
        players:input.players.map(p => {
            if (!p || typeof p.name !== 'string') throw new Error('Invalid player');
            const player = {id:text(String(p.id),80),name:text(p.name,80),isSelf:p.isSelf === true,
                weapon:weapons.has(p.weapon) ? p.weapon : 'Unknown',damage:number(p.damage),dps:number(p.dps),damageShare:Math.min(100,number(p.damageShare)),details:{}};
            for (const key of ['hr','mr','highestHit','highestCrit','monsterHits']) if (p[key] != null) player[key] = number(p[key]);
            for (const key of detailNumbers) if (p.details?.[key] != null) player.details[key] = number(p.details[key]);
            if (p.details?.elementEstimated === true) player.details.elementEstimated=true;
            if (p.details?.element) player.details.element = text(p.details.element,30);
            return player;
        })};
}

function authorized(req, token) {
    const supplied = req.headers.authorization || '';
    const expected = `Bearer ${token}`;
    return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));
}

export function createShareServer({ttlMs=4*60*60*1000, idleMs=10*60*1000, maxRooms=100, now=Date.now, webRoot=null}={}) {
    const rooms = new Map();
    const creations = new Map();
    const sweep = () => {
        const time = now();
        for (const [key, room] of rooms) if (time >= room.expiresAt || time-room.ownerSeen >= idleMs) rooms.delete(key);
        for (const [key, limit] of creations) if (time-limit.since >= 60000) creations.delete(key);
    };
    const timer = setInterval(sweep, 30000).unref();
    const reply = (res, code, data) => {
        res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
        res.end(data === undefined ? '' : JSON.stringify(data));
    };
    async function readBody(req) {
        if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('JSON required'),{status:415});
        if (Number(req.headers['content-length']) > MAX_BODY) throw Object.assign(new Error('Body too large'),{status:413});
        let size=0; const chunks=[];
        for await (const chunk of req) {
            size += chunk.length;
            if (size > MAX_BODY) throw Object.assign(new Error('Body too large'),{status:413});
            chunks.push(chunk);
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    const server = http.createServer({requestTimeout:10000,headersTimeout:10000,maxHeaderSize:8192}, async (req,res) => {
        try {
            const url = new URL(req.url, 'http://internal');
            if (req.method === 'GET' && url.pathname === '/healthz') return reply(res,200,{ok:true});
            // No CORS: sharing is deliberately same-origin through Nginx.
            if (req.headers['sec-fetch-site'] === 'cross-site') return reply(res,403,{error:'Cross-site request denied'});
            sweep();
            if (req.method === 'POST' && url.pathname === '/api/share/rooms') {
                await readBody(req);
                const address = req.socket.remoteAddress; // deliberately do not trust forwarded headers
                const limit = creations.get(address) || {since:now(),count:0};
                if (limit.count >= 20 || rooms.size >= maxRooms) return reply(res,429,{error:'Freigabe-Limit erreicht. Bitte später erneut versuchen.'});
                limit.count++; creations.set(address,limit);
                const room = {id:id(12),publishToken:id(32),viewToken:id(32),expiresAt:now()+ttlMs,ownerSeen:now(),updatedAt:null,packet:null,version:0};
                rooms.set(room.id,room);
                return reply(res,201,{id:room.id,publishToken:room.publishToken,viewToken:room.viewToken,expiresAt:room.expiresAt});
            }
            const match = /^\/api\/share\/rooms\/([A-Za-z0-9_-]{16})$/.exec(url.pathname);
            if (match) {
                const room = rooms.get(match[1]);
                if (!room) return reply(res,404,{error:'Freigabe beendet oder abgelaufen'});
                if (req.method === 'GET') {
                    if (!authorized(req,room.viewToken)) return reply(res,403,{error:'Ungültiger Zuschauerlink'});
                    return reply(res,200,{packet:room.packet,version:room.version,expiresAt:room.expiresAt,
                        ageSeconds:room.updatedAt === null ? null : Math.max(0,(now()-room.updatedAt)/1000),
                        state:room.updatedAt === null ? 'waiting' : now()-room.updatedAt > 10000 ? 'stale' : 'live'});
                }
                if (!authorized(req,room.publishToken)) return reply(res,403,{error:'Publisher token required'});
                if (req.method === 'PUT') {
                    const data = await readBody(req);
                    if (data.packet !== null) {
                        room.packet = sanitizePacket(data.packet);
                        room.updatedAt = now(); room.version++;
                    }
                    room.ownerSeen = now();
                    return reply(res,200,{expiresAt:room.expiresAt});
                }
                if (req.method === 'DELETE') {
                    rooms.delete(room.id);
                    return reply(res,204);
                }
                return reply(res,405,{error:'Method not allowed'});
            }
            // Optional local QA server. Production Nginx owns all static routes.
            if (webRoot && req.method === 'GET' && !url.pathname.startsWith('/api/')) {
                const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
                const filename = path.resolve(webRoot,'.'+relative);
                if (!filename.startsWith(path.resolve(webRoot)+path.sep)) return reply(res,403,{error:'Forbidden'});
                try {
                    const contents = await readFile(filename);
                    const mime = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.zip':'application/zip'};
                    res.writeHead(200,{'Content-Type':mime[path.extname(filename)] || 'application/octet-stream','Cache-Control':'no-store'});
                    return res.end(contents);
                } catch { return reply(res,404,{error:'Not found'}); }
            }
            return reply(res,404,{error:'Not found'});
        } catch (error) {
            if (!res.headersSent) reply(res,error.status || 400,{error:'Ungültige Anfrage'});
            else res.end();
        }
    });
    server.on('close',()=>clearInterval(timer));
    return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const ttl = Number(process.env.SHARE_TTL_HOURS || 4);
    const maxRooms = Number(process.env.SHARE_MAX_ROOMS || 100);
    const port = Number(process.env.PORT || 3000);
    if (!(ttl > 0 && ttl <= 24 && Number.isInteger(maxRooms) && maxRooms > 0 && maxRooms <= 10000)) throw new Error('Invalid sharing configuration');
    const server = createShareServer({ttlMs:ttl*3600000,maxRooms,webRoot:process.env.MHDPS_DEV_WEB_ROOT || null});
    server.listen(port,process.env.HOST || '0.0.0.0',()=>console.log(`MHDPS sharing service listening on ${port}`));
}
