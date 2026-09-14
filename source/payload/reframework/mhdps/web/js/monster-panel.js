/* Optional monster HP row. Values come from telemetry; unknown is never zero. */
class MonsterPanel {
    init(settings) {
        this.settings = settings;
        this.panel = document.getElementById('monsterPanel');
        this.content = document.getElementById('monsterPanelContent');
        this.show = document.getElementById('showMonsterPanel');
        this.animate = document.getElementById('animateMonsterPanel');
        this.show.checked = settings.showMonsterPanel === true;
        this.animate.checked = settings.animateMonsterPanel !== false;
        this.show.addEventListener('change', () => this.save());
        this.animate.addEventListener('change', () => this.save());
        window.MHDPSConnection.onData(packet => { this.quest = packet.quest; this.render(); });
        this.render();
    }
    save() {
        this.settings.showMonsterPanel = this.show.checked;
        this.settings.animateMonsterPanel = this.animate.checked;
        window.MHDPSStorage.saveSettings(this.settings);
        this.render();
    }
    render() {
        if (!this.panel) return;
        const en = window.MHDPSLocale?.language === 'en';
        const tr = (de, english) => en ? english : de;
        const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const value = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
        const fmt = n => value(n) === null ? '—' : Math.round(n).toLocaleString(en ? 'en-US' : 'de-DE');
        document.getElementById('monsterPanelSettingsTitle').textContent = tr('Monster-Anzeige','Monster display');
        document.getElementById('showMonsterPanelLabel').textContent = tr('Monster- und Teile-HP anzeigen','Show monster and part HP');
        document.getElementById('animateMonsterPanelLabel').textContent = tr('Lila Randanimation','Purple border animation');
        this.animate.disabled = !this.show.checked;
        this.panel.hidden = !this.show.checked;
        this.panel.classList.toggle('animated', this.show.checked && this.animate.checked);
        this.panel.setAttribute('aria-label',tr('Monster-HP','Monster HP'));
        if (this.panel.hidden) return;
        const q = this.quest;
        if (!q || q.status === 'idle') {
            this.content.textContent = tr('Keine Quest aktiv','No active quest'); return;
        }
        const bar = (hp,max) => {
            const pct = value(hp) !== null && value(max) !== null && max > 0 ? Math.min(100, hp/max*100) : null;
            return `<div class="part-hp-track"><div style="width:${pct ?? 0}%"></div></div><span class="part-hp-numbers">${fmt(hp)} / ${fmt(max)} HP${pct === null ? '' : ` · ${pct.toFixed(1)}%`}</span>`;
        };
        const parts = Array.isArray(q.parts) ? q.parts.slice(0,64) : [];
        this.content.innerHTML = `<div class="monster-total"><strong>${esc(q.monster || tr('Warte auf Ziel','Waiting for target'))}</strong>${bar(q.monsterHp,q.targetHp)}</div><div class="monster-parts">${parts.length ? parts.map(p=>`<div class="monster-part"><span>${esc(p.name || tr('Teil ','Part ')+p.id)} <small>${esc(p.kind === 'break' ? tr('Bruch','Break') : p.kind === 'sever' ? tr('Abtrennen','Sever') : tr('Teile-Ausdauer','Part durability'))}</small></span>${bar(p.hp,p.maxHp)}</div>`).join('') : `<span class="parts-unavailable">${tr('Teile-HP derzeit nicht verfügbar','Part HP currently unavailable')}</span>`}</div>`;
    }
}
window.MHDPSMonsterPanel = new MonsterPanel();
