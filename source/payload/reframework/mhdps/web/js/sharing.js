/* Optional live sharing. Publisher credentials stay in this tab's sessionStorage. */
class MHDPSSharing {
    constructor() {
        this.room = null;
        this.isViewer = false;
        this.latest = null;
        this.latestAt = 0;
        this.revision = 0;
        this.sentRevision = -1;
        this.lastUpload = 0;
        this.busy = false;
        this.stopping = false;
        this.key = 'mhdps-share-publisher-v1';
    }

    init() {
        this.startButton = document.getElementById('shareStartBtn');
        this.stopButton = document.getElementById('shareStopBtn');
        this.copyButton = document.getElementById('shareCopyBtn');
        this.linkInput = document.getElementById('shareLink');
        this.message = document.getElementById('shareMessage');
        this.controls = document.getElementById('shareLinkControls');
        const fragment = new URLSearchParams(location.hash.slice(1));
        if (fragment.has('watch')) {
            this.isViewer = true;
            document.getElementById('localSetup').hidden = true;
            document.getElementById('shareOwnerControls').hidden = true;
            document.getElementById('shareViewerNote').hidden = false;
            document.getElementById('simToggleBtn').disabled = true;
            document.getElementById('autoSaveBtn').disabled = true;
            const match = /^([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/.exec(fragment.get('watch'));
            if (!match) {
                this.say('Dieser Zuschauerlink ist ungültig.');
                window.MHDPSConnection.updateStatus('disconnected','Ungültiger Zuschauerlink');
                return true; // even invalid spectator links must never access localhost
            }
            this.watch(match[1],match[2]);
            return true;
        }
        this.startButton.addEventListener('click',()=>this.start());
        this.stopButton.addEventListener('click',()=>this.stop());
        this.copyButton.addEventListener('click',()=>this.copy());
        // Local offline dashboard intentionally has no sharing backend.
        if (location.port === '8080' && ['localhost','127.0.0.1'].includes(location.hostname)) {
            this.startButton.disabled = true;
            this.say('Zum Teilen die Homepage mhdps.sengakujiworks.com öffnen.');
            return false;
        }
        window.MHDPSConnection.onData((packet,source)=> {
            if (source !== 'local' || packet.game !== 'wilds') return;
            this.latest = {game:packet.game,quest:packet.quest,players:packet.players};
            this.latestAt = Date.now();
            this.revision++;
        });
        try {
            const room = JSON.parse(sessionStorage.getItem(this.key));
            if (room && room.expiresAt > Date.now() && /^[A-Za-z0-9_-]{16}$/.test(room.id) &&
                /^[A-Za-z0-9_-]{43}$/.test(room.publishToken) && /^[A-Za-z0-9_-]{43}$/.test(room.viewToken)) {
                this.room = room;
                this.renderRoom();
            }
        } catch { /* Storage can be unavailable; the current page still works. */ }
        this.interval = setInterval(()=>this.publish(),500);
        // Revocation is best effort on navigation; an abandoned room also expires server-side.
        window.addEventListener('pagehide',()=> {
            if (!this.room) return;
            fetch(`/api/share/rooms/${this.room.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${this.room.publishToken}`},keepalive:true}).catch(()=>{});
            try { sessionStorage.removeItem(this.key); } catch {}
        });
        return false;
    }

    say(message) {
        this.lastMessage = message;
        this.refreshLanguage();
    }

    refreshLanguage() {
        if (this.message && this.lastMessage) this.message.textContent = window.MHDPSLocale?.translate(this.lastMessage) ?? this.lastMessage;
    }

    async request(url,options={}) {
        const response = await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(8000),...options});
        if (!response.ok) {
            const error = new Error(response.status === 404 ? 'Freigabe beendet oder Dienst noch nicht bereit.' : 'Freigabe-Dienst nicht erreichbar. Bitte erneut versuchen.');
            error.status = response.status;
            throw error;
        }
        return response.status === 204 ? null : response.json();
    }

    async start() {
        if (this.room || this.busy) return;
        if (!this.latest || Date.now()-this.latestAt > 5000) {
            this.say('Zuerst Begleiter und Wilds verbinden. Sobald Spieldaten eintreffen, kannst du teilen.');
            return;
        }
        this.busy = true;
        this.startButton.disabled = true;
        try {
            this.room = await this.request('/api/share/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
            try { sessionStorage.setItem(this.key,JSON.stringify(this.room)); } catch {}
            this.sentRevision = -1;
            this.renderRoom();
        } catch (error) { this.say(error.message); }
        finally { this.busy = false; this.startButton.disabled = !!this.room; }
        if (this.room) this.publish();
    }

    renderRoom() {
        this.startButton.disabled = !!this.room;
        this.controls.hidden = !this.room;
        const shareBtn = document.getElementById('shareModalBtn');
        if (shareBtn?.classList?.toggle) shareBtn.classList.toggle('has-active-share', !!this.room);
        if (!this.room) { this.linkInput.value = ''; return; }
        this.linkInput.value = `${location.origin}${location.pathname}#watch=${this.room.id}.${this.room.viewToken}`;
        const expires = new Date(this.room.expiresAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        this.say(`Freigabe aktiv bis ${expires}. Jeder mit dem Link kann deine Kampfwerte sehen. Diesen Tab offen lassen.`);
    }

    async publish() {
        if (!this.room || this.busy || this.stopping || this.paused) return;
        if (Date.now() >= this.room.expiresAt) return this.forget('Freigabe abgelaufen. Du kannst einen neuen Link erstellen.');
        const fresh = this.latest && Date.now()-this.latestAt < 5000 && this.sentRevision !== this.revision;
        if (!fresh && Date.now()-this.lastUpload < 10000) return;
        this.busy = true;
        const room = this.room;
        const revision = this.revision;
        try {
            await this.request(`/api/share/rooms/${room.id}`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${room.publishToken}`},
                body:JSON.stringify({packet:fresh ? this.latest : null})});
            if (this.room === room && !this.stopping) {
                this.sentRevision = revision; this.lastUpload = Date.now();
                this.renderRoom();
            }
        } catch (error) {
            if (this.room !== room || this.stopping) return;
            if ([403,404].includes(error.status)) this.forget('Freigabe beendet oder abgelaufen. Erstelle bei Bedarf einen neuen Link.');
            else this.say('Übertragung unterbrochen. Verbindung wird erneut versucht; dein lokales DPS-Meter läuft weiter.');
        } finally { this.busy = false; }
    }

    forget(message) {
        this.room = null;
        this.paused = false;
        try { sessionStorage.removeItem(this.key); } catch {}
        const shareBtn = document.getElementById('shareModalBtn');
        if (shareBtn?.classList?.remove) shareBtn.classList.remove('has-active-share');
        this.renderRoom();
        this.say(message);
    }

    async stop() {
        if (!this.room || this.stopping) return;
        this.stopping = true;
        this.stopButton.disabled = true;
        try {
            await this.request(`/api/share/rooms/${this.room.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${this.room.publishToken}`}});
            this.forget('Freigabe beendet. Der Zuschauerlink ist jetzt ungültig.');
        } catch (error) {
            if ([403,404].includes(error.status)) this.forget('Freigabe bereits beendet.');
            else this.say('Beenden nicht bestätigt. Upload pausiert. Bitte erneut „Freigabe beenden“ klicken; ohne Upload endet die Freigabe spätestens nach 10 Minuten.');
        } finally {
            this.stopButton.disabled = false;
            // On failure keep uploads paused, but allow another explicit stop request.
            this.paused = !!this.room;
            this.stopping = false;
        }
    }

    async copy() {
        try {
            await navigator.clipboard.writeText(this.linkInput.value);
            this.copyButton.textContent = window.MHDPSLocale?.translate('Kopiert') ?? 'Kopiert';
            setTimeout(()=>{ this.copyButton.textContent = window.MHDPSLocale?.translate('Link kopieren') ?? 'Link kopieren'; },1800);
        } catch {
            this.linkInput.focus(); this.linkInput.select();
            this.say('Link markiert – bitte mit Strg+C kopieren.');
        }
    }

    async watch(roomId,token) {
        let version = -1;
        let terminal = false;
        this.say('Zuschaueransicht wird verbunden …');
        const poll = async () => {
            try {
                const state = await this.request(`/api/share/rooms/${roomId}`,{headers:{Authorization:`Bearer ${token}`}});
                if (state.packet && version !== state.version) {
                    version = state.version;
                    window.MHDPSConnection.notifyData(state.packet,'shared');
                }
                const live = state.state === 'live';
                window.MHDPSConnection.updateStatus(live ? 'connected' : 'connecting',live ? 'Live · Zuschauer' : 'Zuschauer · warte auf Gastgeber');
                this.say(live ? 'Du siehst die vom Gaming-PC des Gastgebers erfassten Werte.' :
                    (state.state === 'stale' ? `Keine neuen Daten vom Gastgeber seit ${Math.floor(state.ageSeconds)} Sekunden. Anzeige zeigt den letzten Stand.` : 'Freigabe verbunden. Der Gastgeber hat noch keine Spieldaten übertragen.'));
            } catch (error) {
                terminal = [403,404].includes(error.status);
                window.MHDPSConnection.updateStatus('disconnected',terminal ? 'Freigabe beendet' : 'Zuschauer · Verbindung unterbrochen');
                this.say(terminal ? 'Diese Freigabe wurde beendet oder ist abgelaufen. Bitte den Gastgeber um einen neuen Link bitten.' : 'Verbindung unterbrochen. Die Zuschaueransicht verbindet sich automatisch erneut.');
                if (terminal) window.MHDPSConnection.notifyData({game:'wilds',quest:{status:'idle',timeSeconds:0,monster:'Freigabe beendet'},players:[]},'shared');
            }
            if (!terminal) this.viewerTimer = setTimeout(poll,1000);
        };
        await poll();
    }
}
window.MHDPSSharing = new MHDPSSharing();
