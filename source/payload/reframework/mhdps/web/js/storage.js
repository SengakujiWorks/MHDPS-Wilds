/**
 * MHDPS - Local Storage & IndexedDB Module
 * 100% Client-Side: Zero data leaves the user's browser.
 */
class MHDPSStorage {
    constructor() {
        this.dbName = 'MHDPS_Database';
        this.dbVersion = 1;
        this.db = null;
        this.initPromise = this.initDB();
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('hunts')) {
                    const store = db.createObjectStore('hunts', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('game', 'game', { unique: false });
                    store.createIndex('monster', 'monster', { unique: false });
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };

            request.onerror = (e) => {
                console.error("IndexedDB error:", e);
                reject(e);
            };
        });
    }

    // Save hunt record
    async saveHunt(huntData) {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('hunts', 'readwrite');
            const store = tx.objectStore('hunts');
            const record = {
                ...huntData,
                timestamp: Date.now(),
                dateStr: new Date().toLocaleString()
            };
            const request = store.add(record);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e);
        });
    }

    // Get recent hunts
    async getHunts(limit = 50) {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('hunts', 'readonly');
            const store = tx.objectStore('hunts');
            const index = store.index('timestamp');
            const request = index.openCursor(null, 'prev');
            const results = [];

            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor && results.length < limit) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = (e) => reject(e);
        });
    }

    // Clear all hunt history
    async clearHistory() {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('hunts', 'readwrite');
            const store = tx.objectStore('hunts');
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }

    // Settings storage in localStorage
    getSettings() {
        try {
            const stored = localStorage.getItem('mhdps_settings');
            const defaults = {
                language: 'de',
                showMonsterPanel: false,
                animateMonsterPanel: true,
                autoSave: true,
                websocketPort: 9999,
                playAlertSound: false,
                themeMode: 'auto',
                columns: {
                    dps: true,
                    totalDamage: true,
                    damageShare: true,
                    highestHit: true,
                    highestCrit: false,
                    monsterHits: false,
                    healingDone: false,
                    palicoDamage: false,
                    range: false
                }
            };
            if (!stored) return defaults;
            const parsed = JSON.parse(stored);
            return {
                ...defaults,
                ...parsed,
                columns: { ...defaults.columns, ...(parsed.columns || {}) }
            };
        } catch (e) {
            return {
                language: 'de',
                showMonsterPanel: false,
                animateMonsterPanel: true,
                autoSave: true,
                websocketPort: 9999,
                playAlertSound: false,
                themeMode: 'auto',
                columns: {
                    dps: true,
                    totalDamage: true,
                    damageShare: true,
                    highestHit: true,
                    highestCrit: false,
                    monsterHits: false,
                    healingDone: false,
                    palicoDamage: false,
                    range: false
                }
            };
        }
    }

    saveSettings(settings) {
        localStorage.setItem('mhdps_settings', JSON.stringify(settings));
    }
}

window.MHDPSStorage = new MHDPSStorage();
