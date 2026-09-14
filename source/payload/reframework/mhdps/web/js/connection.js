/**
 * MHDPS - WebSocket Connection Manager
 * Connects directly to local game relay on 127.0.0.1 (Localhost).
 * Zero server proxying, instant sub-millisecond local latency.
 */
class MHDPSConnection {
    constructor() {
        this.socket = null;
        this.port = 9999;
        this.isConnected = false;
        this.isReconnecting = false;
        this.reconnectTimer = null;
        this.onDataCallbacks = [];
        this.onStatusChangeCallbacks = [];
    }

    init(port = 9999) {
        this.port = port;
        this.connect();
    }

    connect() {
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const url = `ws://127.0.0.1:${this.port}`;
        this.updateStatus('connecting', 'Verbinde...');

        try {
            this.socket = new WebSocket(url);

            this.socket.onopen = () => {
                this.isConnected = true;
                this.isReconnecting = false;
                if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
                this.updateStatus('connecting', 'Relay verbunden – warte auf Spieldaten');
                console.log('[MHDPS] WebSocket connected to local bridge');
            };

            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'relay_status') {
                        this.updateStatus(data.state === 'live' ? 'connected' : 'connecting', data.message);
                        return;
                    }
                    if (!data.quest || !Array.isArray(data.players)) return;
                    this.updateStatus('connected', 'Live · ' + (data.quest.status === 'in_progress' ? 'Quest aktiv' : 'Spiel erkannt'));
                    if (data.diagnostics?.errors?.length) this.updateStatus('disconnected', 'Mod-Fehler: REFramework-Menü prüfen');
                    if (window.MHDPSCombatSimulator?.isRunning) {
                        window.MHDPSCombatSimulator.stop();
                        document.getElementById('simToggleBtn')?.classList.remove('primary');
                        const button = document.getElementById('simToggleBtn');
                        if (button) button.textContent = 'Demo Simulator';
                    }
                    this.notifyData(data, 'local');
                } catch (err) {
                    console.error('[MHDPS] Failed to parse incoming JSON:', err, event.data);
                }
            };

            this.socket.onclose = () => {
                this.isConnected = false;
                this.updateStatus('disconnected', 'Begleiter starten / lokalen Zugriff erlauben');
                this.scheduleReconnect();
            };

            this.socket.onerror = (err) => {
                // Connection failed (expected when game/relay is not yet running)
                this.isConnected = false;
                this.updateStatus('disconnected', 'Warte auf Spiel...');
                this.scheduleReconnect();
            };

        } catch (e) {
            this.isConnected = false;
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            if (!this.isConnected) {
                this.connect();
            }
        }, 2000);
    }

    onData(callback) {
        this.onDataCallbacks.push(callback);
    }

    onStatusChange(callback) {
        this.onStatusChangeCallbacks.push(callback);
    }

    notifyData(data, source = 'demo') {
        for (const cb of this.onDataCallbacks) {
            try { cb(data, source); } catch (e) { console.error(e); }
        }
    }

    refreshLanguage() {
        if (this.lastStatus) this.updateStatus(...this.lastStatus);
    }

    updateStatus(state, message) {
        this.lastStatus = [state, message];
        message = window.MHDPSLocale?.translate(message) ?? message;
        for (const cb of this.onStatusChangeCallbacks) {
            try { cb(state, message); } catch (e) { console.error(e); }
        }
    }
}

window.MHDPSConnection = new MHDPSConnection();
