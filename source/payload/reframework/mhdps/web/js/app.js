/**
 * MHDPS - Main Application Controller
 * High-Contrast Minimalist Telemetry HUD
 * Handles live combat telemetry, dynamic metric columns,
 * clean modals, spectator sharing UI, and multi-game modes.
 */

document.addEventListener('DOMContentLoaded', () => {
    const state = {
        currentGame: 'wilds', // 'wilds' | 'world' | 'rise'
        currentLang: 'de',
        expandedPlayerIds: new Set(),
        currentQuest: null,
        latestPlayers: [],
        settings: window.MHDPSStorage.getSettings()
    };

    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

    const savedQuests = new Set();

    // DOM Elements Mapping
    const elements = {
        gameBadge: document.getElementById('gameBadge'),
        gameBadgeText: document.getElementById('gameBadgeText'),
        questTimer: document.getElementById('questTimer'),
        monsterName: document.getElementById('monsterName'),
        monsterHpFill: document.getElementById('monsterHpFill'),
        monsterHpText: document.getElementById('monsterHpText'),
        systemClock: document.getElementById('systemClock'),
        huntersList: document.getElementById('huntersList'),
        connectionPill: document.getElementById('connectionPill'),
        connectionText: document.getElementById('connectionText'),
        simToggleBtn: document.getElementById('simToggleBtn'),
        autoSaveBtn: document.getElementById('autoSaveBtn'),
        historyBtn: document.getElementById('historyBtn'),
        historyModal: document.getElementById('historyModal'),
        historyList: document.getElementById('historyList'),
        closeHistoryBtn: document.getElementById('closeHistoryBtn'),
        exportAllJsonBtn: document.getElementById('exportAllJsonBtn'),
        clearHistoryBtn: document.getElementById('clearHistoryBtn'),
        settingsBtn: document.getElementById('settingsBtn'),
        settingsModal: document.getElementById('settingsModal'),
        closeSettingsBtn: document.getElementById('closeSettingsBtn'),
        saveSettingsBtn: document.getElementById('saveSettingsBtn'),
        columnsCheckboxGrid: document.getElementById('columnsCheckboxGrid'),
        shareModalBtn: document.getElementById('shareModalBtn'),
        shareModal: document.getElementById('shareModal'),
        closeShareModalBtn: document.getElementById('closeShareModalBtn'),
        dismissShareModalBtn: document.getElementById('dismissShareModalBtn'),
        langDeBtn: document.getElementById('langDeBtn'),
        langEnBtn: document.getElementById('langEnBtn')
    };

    const I18N = {
        de: {
            noQuest: "Keine Quest aktiv",
            waitingGame: "Warte auf Spiel...",
            connected: "Verbunden",
            questDuration: "Quest-Dauer",
            questTimeCombat: "DPS = Schaden / Questzeit.",
            questTimeNormal: "DPS über Quest-Zeit",
            shareBtnTitle: "Live-Ansicht teilen (Zuschauerlink)",
            historyBtnTitle: "Quest-Historie anzeigen",
            settingsBtnTitle: "Einstellungen & Spalten konfigurieren",
            gameBadgeTitle: "Klicken zum manuellen Wechseln des Spielmodus",
            viewerTag: "ZUSCHAUER",
            viewerNote: "Keine Mod oder Begleiter erforderlich. Die Daten werden live vom Gaming-PC des Gastgebers gestreamt.",
            emptyViewerTitle: "Noch keine übertragene Jagd",
            emptyViewerSubtitle: "Die Daten kommen ausschließlich vom Gastgeber.",
            emptyTitle: "Keine Quest aktiv",
            selfTag: "DU",
            hostTag: "HOST",
            share: "Anteil",
            total: "Gesamt",
            maxHit: "Max Hit",
            maxCrit: "Max Crit",
            hits: "Hits",
            healing: "Heilung",
            palico: "Palico",
            range: "Distanz",
            melee: "Nah",
            ranged: "Fern",
            elementRaw: "Element & Physisch",
            type: "Typ:",
            rawDamage: "Physischer Schaden:",
            elementDamage: "Elementar-Schaden:",
            trueDamage: "Fester Schaden (True):",
            notRecorded: "Nicht erfasst",
            elementEstimated: "Nicht vollständig gemessen",
            crowdControl: "Crowd Control (CC)",
            knockouts: "Knockouts (KO):",
            stuns: "Stuns / Betäubt:",
            paralyzeSleep: "Paralyse / Schlaf:",
            woundsOpened: "Wunden geöffnet:",
            focusStrikes: "Fokus-Treffer:",
            tenderizes: "Zartgemacht (Tenderize):",
            wallBangs: "Mauer-Rempler:",
            wyvernRides: "Wyvern-Ritt:",
            wirebugCounters: "Seilkäfer-Konter:",
            supportHealing: "Support & Heilung",
            teamHealingDone: "Team-Heilung verteilt:",
            companionTitle: "Jagdbegleiter",
            companionDamage: "Begleiter-Schaden:",
            shareModalTitle: "Live-Ansicht teilen",
            shareIntro: "Erstelle einen temporären Zuschauerlink für deine Mitspieler oder Streamer. Zuschauer benötigen weder Mod noch Begleiter.",
            shareStartBtn: "Live-Ansicht starten",
            shareLinkLabel: "Zuschauerlink",
            shareCopyBtn: "Link kopieren",
            shareStopBtn: "Freigabe beenden",
            shareMessageDefault: "Teile deine aktuelle Jagd, sobald dein Spiel verbunden ist.",
            sharePrivacy: "Beim Teilen werden Spielernamen und Kampfwerte über diesen Server gestreamt. Ohne Freigabe bleiben alle Spieldaten ausschließlich lokal auf deinem PC.",
            close: "Schließen",
            historyModalTitle: "Lokale Quest-Historie",
            clearHistory: "Historie leeren",
            exportJson: "Als JSON exportieren",
            historyEmpty: "Noch keine Quests lokal gespeichert.",
            duration: "Dauer:",
            settingsModalTitle: "Einstellungen & Werkzeuge",
            languageLabel: "Sprache / Language",
            columnsSectionTitle: "Anzuzeigende Werte im Hauptbalken",
            columnsSectionDesc: "Wähle aus, welche Spalten direkt in der Zeile jedes Jägers sichtbar sein sollen:",
            colDps: "DPS (Schaden/Sek.)",
            colTotalDamage: "Gesamtschaden",
            colHighestHit: "Höchster Treffer",
            colHighestCrit: "Höchster Krit (Crit)",
            colMonsterHits: "Treffer (Hits Count)",
            colHealingDone: "Team-Heilung",
            colPalicoDamage: "Begleiter / Palico",
            colRange: "Distanz (Nah/Fern)",
            toolsSectionTitle: "Werkzeuge & Simulation",
            simName: "Kampfsimulator",
            simDesc: "Simuliert einen 4-Spieler-Kampf zum Testen des Layouts.",
            simBtnStart: "Demo Simulator",
            simBtnStop: "Simulation Stoppen",
            autoSaveName: "Auto-Save",
            autoSaveDesc: "Speichert abgeschlossene Quests automatisch im Browser.",
            autoSaveActive: "Auto-Save Aktiv",
            autoSaveInactive: "Auto-Save Aus",
            companionSectionTitle: "Begleiter & Verbindung",
            companionInfoTitle: "Live-Daten von diesem Gaming-PC:",
            companionInfoBody: "Aktiviere MHDPS über Vortex/Fluffy und starte Wilds. Der Begleiter startet automatisch.",
            dlCompanion: "Windows-Begleiter",
            dlMod: "MHDPS Mod",
            dlGuide: "Einrichtung & Hilfe",
            dlDashboard: "Lokales Offline-Dashboard",
            systemClockLabel: "Systemzeit:",
            localPortLabel: "Lokaler Port: ws://127.0.0.1:9999",
            done: "Fertig",
            weapons: {
                GreatSword: "Großschwert",
                LongSword: "Langschwert",
                SwordAndShield: "Schwert & Schild",
                DualBlades: "Doppelklingen",
                Hammer: "Hammer",
                HuntingHorn: "Jagdhorn",
                Lance: "Lanze",
                Gunlance: "Gewehrlanze",
                SwitchAxe: "Morph-Axt",
                ChargeBlade: "Energieklinge",
                InsectGlaive: "Insektenglefe",
                LightBowgun: "Leichte Armbrust",
                HeavyBowgun: "Schwere Armbrust",
                Bow: "Bogen",
                Palico: "Palico / Felyne"
            }
        },
        en: {
            noQuest: "No Active Quest",
            waitingGame: "Waiting for game...",
            connected: "Connected",
            questDuration: "Quest Duration",
            questTimeCombat: "DPS = damage / quest duration.",
            questTimeNormal: "DPS calculated over quest duration",
            shareBtnTitle: "Share Live Spectator View",
            historyBtnTitle: "Quest History",
            settingsBtnTitle: "Settings & Column Layout",
            gameBadgeTitle: "Click to toggle game mode",
            viewerTag: "SPECTATOR",
            viewerNote: "No mod or companion required. Data is streamed live from host's gaming PC.",
            emptyViewerTitle: "No Hunt Shared Yet",
            emptyViewerSubtitle: "Combat telemetry is streamed exclusively by the host.",
            emptyTitle: "No Active Quest",
            selfTag: "YOU",
            hostTag: "HOST",
            share: "Share",
            total: "Total",
            maxHit: "Max Hit",
            maxCrit: "Max Crit",
            hits: "Hits",
            healing: "Healing",
            palico: "Palico",
            range: "Range",
            melee: "Melee",
            ranged: "Ranged",
            elementRaw: "Element & Raw Damage",
            type: "Type:",
            rawDamage: "Raw Damage:",
            elementDamage: "Element Damage:",
            trueDamage: "True / Fixed Damage:",
            notRecorded: "None",
            elementEstimated: "Partially Estimated",
            crowdControl: "Crowd Control (CC)",
            knockouts: "Knockouts (KO):",
            stuns: "Stuns:",
            paralyzeSleep: "Paralyze / Sleep:",
            woundsOpened: "Wounds Opened:",
            focusStrikes: "Focus Strikes:",
            tenderizes: "Tenderized:",
            wallBangs: "Wall Bangs:",
            wyvernRides: "Wyvern Rides:",
            wirebugCounters: "Wirebug Counters:",
            supportHealing: "Support & Healing",
            teamHealingDone: "Team Healing Done:",
            companionTitle: "Companion / Palico",
            companionDamage: "Companion Damage:",
            shareModalTitle: "Share Live Telemetry",
            shareIntro: "Create a temporary spectator link for teammates or stream viewers. Spectators do not need any mod or companion installed.",
            shareStartBtn: "Start Live Sharing",
            shareLinkLabel: "Spectator Link",
            shareCopyBtn: "Copy Link",
            shareStopBtn: "Stop Sharing",
            shareMessageDefault: "Share your active hunt as soon as your game is connected.",
            sharePrivacy: "When sharing, player names and combat stats are streamed through this server. Without sharing, all game data stays strictly local on your PC.",
            close: "Close",
            historyModalTitle: "Local Hunt History",
            clearHistory: "Clear History",
            exportJson: "Export as JSON",
            historyEmpty: "No quests recorded yet.",
            duration: "Duration:",
            settingsModalTitle: "Settings & Tools",
            languageLabel: "Language / Sprache",
            columnsSectionTitle: "Displayed Column Metrics",
            columnsSectionDesc: "Select which metrics are displayed directly in each hunter's row:",
            colDps: "DPS (Damage / Sec)",
            colTotalDamage: "Total Damage",
            colHighestHit: "Highest Hit",
            colHighestCrit: "Highest Crit",
            colMonsterHits: "Hit Count",
            colHealingDone: "Team Healing",
            colPalicoDamage: "Companion / Palico",
            colRange: "Combat Range (Melee/Ranged)",
            toolsSectionTitle: "Tools & Simulation",
            simName: "Combat Simulator",
            simDesc: "Simulates a 4-player hunt to preview the layout.",
            simBtnStart: "Demo Simulator",
            simBtnStop: "Stop Simulation",
            autoSaveName: "Auto-Save",
            autoSaveDesc: "Automatically saves completed quests in browser storage.",
            autoSaveActive: "Auto-Save Active",
            autoSaveInactive: "Auto-Save Disabled",
            companionSectionTitle: "Companion & Setup",
            companionInfoTitle: "Live Telemetry from this PC:",
            companionInfoBody: "Enable MHDPS through Vortex/Fluffy and start Wilds. The companion starts automatically.",
            dlCompanion: "Windows Companion",
            dlMod: "MHDPS Mod",
            dlGuide: "Setup & Guide",
            dlDashboard: "Local Offline Dashboard",
            systemClockLabel: "System Time:",
            localPortLabel: "Local Port: ws://127.0.0.1:9999",
            done: "Done",
            weapons: {
                GreatSword: "Great Sword",
                LongSword: "Long Sword",
                SwordAndShield: "Sword & Shield",
                DualBlades: "Dual Blades",
                Hammer: "Hammer",
                HuntingHorn: "Hunting Horn",
                Lance: "Lance",
                Gunlance: "Gunlance",
                SwitchAxe: "Switch Axe",
                ChargeBlade: "Charge Blade",
                InsectGlaive: "Insect Glaive",
                LightBowgun: "Light Bowgun",
                HeavyBowgun: "Heavy Bowgun",
                Bow: "Bow",
                Palico: "Palico"
            }
        }
    };

    function t(key) {
        const dict = I18N[state.currentLang] || I18N.de;
        return dict[key] !== undefined ? dict[key] : (I18N.de[key] ?? key);
    }

    function getWeaponName(weapon) {
        const dict = I18N[state.currentLang]?.weapons || I18N.de.weapons;
        return dict[weapon] || window.MHDPS_WEAPON_NAMES?.[weapon] || weapon;
    }

    function applyLanguage(lang) {
        lang = lang === 'en' ? 'en' : 'de';
        state.currentLang = lang;
        window.MHDPSLocale?.setLanguage(lang);
        if (state.settings) {
            state.settings.language = lang;
            if (window.MHDPSStorage?.saveSettings) {
                window.MHDPSStorage.saveSettings(state.settings);
            }
        }

        if (elements.langDeBtn?.classList) elements.langDeBtn.classList.toggle('active', lang === 'de');
        if (elements.langEnBtn?.classList) elements.langEnBtn.classList.toggle('active', lang === 'en');

        try {
            if (document.documentElement) {
                document.documentElement.lang = lang;
            }
        } catch (e) {}

        for (const id of ['closeSettingsBtn','closeHistoryBtn','closeShareModalBtn']) {
            const button = document.getElementById(id);
            button?.setAttribute?.('aria-label', t('close'));
            if (button) button.title = t('close');
        }
        // Header tooltips & titles
        if (elements.gameBadge) elements.gameBadge.title = t('gameBadgeTitle');
        if (elements.shareModalBtn) {
            elements.shareModalBtn.title = t('shareBtnTitle');
            elements.shareModalBtn.setAttribute?.('aria-label', t('shareBtnTitle'));
        }
        if (elements.historyBtn) {
            elements.historyBtn.title = t('historyBtnTitle');
            elements.historyBtn.setAttribute?.('aria-label', t('historyBtnTitle'));
        }
        if (elements.settingsBtn) {
            elements.settingsBtn.title = t('settingsBtnTitle');
            elements.settingsBtn.setAttribute?.('aria-label', t('settingsBtnTitle'));
        }

        // Connection text
        if (elements.connectionPill) {
            const isDisc = elements.connectionPill.classList?.contains?.('disconnected') || (typeof elements.connectionPill.className === 'string' && elements.connectionPill.className.includes('disconnected'));
            if (isDisc) {
                elements.connectionPill.title = t('waitingGame');
                if (elements.connectionText) elements.connectionText.textContent = t('waitingGame');
            }
        }

        // Spectator banner
        const viewerNote = document.getElementById('shareViewerNote');
        if (viewerNote?.querySelector) {
            const tag = viewerNote.querySelector('.viewer-tag');
            if (tag) tag.textContent = t('viewerTag');
            const noteText = viewerNote.querySelector('.viewer-note-content span:last-child');
            if (noteText) noteText.textContent = t('viewerNote');
        }

        // Modals: Share
        const shareTitle = document.getElementById('shareModalTitle');
        if (shareTitle) shareTitle.textContent = t('shareModalTitle');
        const shareIntro = document.querySelector ? document.querySelector('#shareOwnerControls .modal-intro') : null;
        if (shareIntro) shareIntro.textContent = t('shareIntro');
        const shareStart = document.getElementById('shareStartBtn');
        if (shareStart) shareStart.textContent = t('shareStartBtn');
        const shareLinkLabel = document.querySelector ? document.querySelector('label[for="shareLink"]') : null;
        if (shareLinkLabel) shareLinkLabel.textContent = t('shareLinkLabel');
        const shareCopy = document.getElementById('shareCopyBtn');
        if (shareCopy) shareCopy.textContent = t('shareCopyBtn');
        const shareStop = document.getElementById('shareStopBtn');
        if (shareStop) shareStop.textContent = t('shareStopBtn');
        const shareMsg = document.getElementById('shareMessage');
        if (shareMsg && !window.MHDPSSharing?.lastMessage) {
            shareMsg.textContent = t('shareMessageDefault');
        }
        const sharePrivacy = document.querySelector ? document.querySelector('#shareOwnerControls .privacy-note span') : null;
        if (sharePrivacy) sharePrivacy.textContent = t('sharePrivacy');
        const dismissShare = document.getElementById('dismissShareModalBtn');
        if (dismissShare) dismissShare.textContent = t('close');

        // Modals: History
        const historyTitle = document.getElementById('historyModalTitle');
        if (historyTitle) historyTitle.textContent = t('historyModalTitle');
        const clearHistory = document.getElementById('clearHistoryBtn');
        if (clearHistory) clearHistory.textContent = t('clearHistory');
        const exportAll = document.getElementById('exportAllJsonBtn');
        if (exportAll) exportAll.textContent = t('exportJson');

        // Modals: Settings
        const settingsTitle = document.getElementById('settingsModalTitle');
        if (settingsTitle) settingsTitle.textContent = t('settingsModalTitle');
        const langLabel = document.getElementById('languageLabel');
        if (langLabel) langLabel.textContent = t('languageLabel');
        const colsTitle = document.getElementById('columnsSectionTitle');
        if (colsTitle) colsTitle.textContent = t('columnsSectionTitle');
        const colsDesc = document.getElementById('columnsSectionDesc');
        if (colsDesc) colsDesc.textContent = t('columnsSectionDesc');

        // Checkbox labels in settings
        const colLabels = {
            dps: t('colDps'),
            totalDamage: t('colTotalDamage'),
            highestHit: t('colHighestHit'),
            highestCrit: t('colHighestCrit'),
            monsterHits: t('colMonsterHits'),
            healingDone: t('colHealingDone'),
            palicoDamage: t('colPalicoDamage'),
            range: t('colRange')
        };
        const checkboxes = document.querySelectorAll ? document.querySelectorAll('#columnsCheckboxGrid label.setting-checkbox-label') : [];
        checkboxes.forEach(label => {
            const input = label.querySelector ? label.querySelector('input[data-col]') : null;
            const span = label.querySelector ? label.querySelector('span') : null;
            if (input && span && colLabels[input.dataset?.col]) {
                span.textContent = colLabels[input.dataset.col];
            }
        });

        const toolsTitle = document.getElementById('toolsSectionTitle');
        if (toolsTitle) toolsTitle.textContent = t('toolsSectionTitle');
        const compTitle = document.getElementById('companionSectionTitle');
        if (compTitle) compTitle.textContent = t('companionSectionTitle');
        const sysClockLabel = document.getElementById('systemClockLabel');
        if (sysClockLabel) sysClockLabel.textContent = t('systemClockLabel');
        const localPortText = document.getElementById('localPortText');
        if (localPortText) localPortText.textContent = t('localPortLabel');

        // Tools labels in settings
        const toolCards = document.querySelectorAll ? document.querySelectorAll('.tools-action-grid .tool-card') : [];
        if (toolCards.length >= 2) {
            const simName = toolCards[0].querySelector ? toolCards[0].querySelector('.tool-name') : null;
            const simDesc = toolCards[0].querySelector ? toolCards[0].querySelector('.tool-desc') : null;
            if (simName) simName.textContent = t('simName');
            if (simDesc) simDesc.textContent = t('simDesc');

            const autoName = toolCards[1].querySelector ? toolCards[1].querySelector('.tool-name') : null;
            const autoDesc = toolCards[1].querySelector ? toolCards[1].querySelector('.tool-desc') : null;
            if (autoName) autoName.textContent = t('autoSaveName');
            if (autoDesc) autoDesc.textContent = t('autoSaveDesc');
        }

        if (elements.simToggleBtn) {
            elements.simToggleBtn.textContent = window.MHDPSCombatSimulator?.isRunning ? t('simBtnStop') : t('simBtnStart');
        }
        if (elements.autoSaveBtn) {
            elements.autoSaveBtn.textContent = state.settings?.autoSave ? t('autoSaveActive') : t('autoSaveInactive');
        }

        // Companion setup in settings
        const companionSetup = document.getElementById('localSetup');
        if (companionSetup) {
            const setupInfo = companionSetup.querySelector ? companionSetup.querySelector('.setup-info') : null;
            if (setupInfo) {
                setupInfo.innerHTML = `<strong>${t('companionInfoTitle')}</strong> ${t('companionInfoBody')}`;
            }
            const dlLinks = companionSetup.querySelectorAll ? companionSetup.querySelectorAll('.download-link') : [];
            if (dlLinks.length >= 3) {
                if (dlLinks[0].lastChild) dlLinks[0].lastChild.textContent = ' ' + t('dlMod');
                if (dlLinks[1].lastChild) dlLinks[1].lastChild.textContent = ' ' + t('dlGuide');
                if (dlLinks[2].lastChild) dlLinks[2].lastChild.textContent = ' ' + t('dlDashboard');
            }
        }
        if (elements.saveSettingsBtn) elements.saveSettingsBtn.textContent = t('done');

        window.MHDPSSharing?.refreshLanguage?.();
        window.MHDPSConnection?.refreshLanguage?.();
        window.MHDPSMonsterPanel?.render?.();

        // Re-render views
        if (state.currentQuest) renderQuestHUD(state.currentQuest);
        else if (elements.monsterName) elements.monsterName.textContent = t('noQuest');
        renderPlayers(state.latestPlayers);
    }


    // System Clock Synchronizer
    function updateClock() {
        if (!elements.systemClock) return;
        const now = new Date();
        elements.systemClock.textContent = now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
    updateClock();
    setInterval(updateClock, 1000);

    // Auto-Save UI State Initialization
    if (elements.autoSaveBtn) {
        const isActive = !!state.settings.autoSave;
        elements.autoSaveBtn.classList.toggle('active', isActive);
        elements.autoSaveBtn.textContent = isActive ? 'Auto-Save Aktiv' : 'Auto-Save Aus';
    }

    // Set Game Theme (Wilds, World, Rise)
    function setGameTheme(game) {
        if (state.currentGame === game) return;
        state.currentGame = game;
        document.body.setAttribute('data-game', game);

        const titles = {
            wilds: "MH Wilds",
            world: "MH World: Iceborne",
            rise: "MH Rise: Sunbreak"
        };
        if (elements.gameBadgeText) {
            elements.gameBadgeText.textContent = titles[game] || "Monster Hunter";
        }
        console.log(`[MHDPS] Switched game mode to: ${game}`);
    }

    // Format Seconds to MM:SS.S
    function formatTime(seconds) {
        if (!seconds || seconds <= 0) return "00:00.0";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const tenths = Math.floor((seconds % 1) * 10);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
    }

    // Render Quest Telemetry HUD
    function renderQuestHUD(quest) {
        if (!quest) {
            if (elements.monsterName) elements.monsterName.textContent = t('noQuest');
            return;
        }
        if (elements.questTimer) {
            elements.questTimer.textContent = formatTime(quest.timeSeconds);
            elements.questTimer.title = t('questTimeNormal');
        }
        if (elements.monsterName) {
            elements.monsterName.textContent = quest.monster || (quest.status === 'in_progress' ? (state.currentLang === 'en' ? 'Waiting for target' : 'Warte auf Ziel') : t('noQuest'));
        }

        const hp = Math.max(0, Math.min(100, quest.monsterHpPercent ?? 0));
        if (elements.monsterHpFill) {
            elements.monsterHpFill.style.width = `${hp}%`;
        }
        if (elements.monsterHpText) {
            elements.monsterHpText.textContent = quest.monsterHpPercent == null ? '—' : `${hp.toFixed(1)}%`;
        }

        if (['completed', 'ended', 'failed', 'aborted'].includes(quest.status) && !savedQuests.has(quest.id || 'legacy') && state.currentQuest) {
            savedQuests.add(quest.id || 'legacy');
            onQuestCompleted(quest, state.latestPlayers);
        }
        if (quest.status === 'in_progress') savedQuests.delete('legacy');
        state.currentQuest = { ...quest };
    }

    // Auto-save on quest complete
    async function onQuestCompleted(quest, players) {
        if (window.MHDPSSharing?.isViewer) return;
        if (state.settings.autoSave && players.length > 0) {
            const huntRecord = {
                game: state.currentGame,
                questId: quest.id,
                outcome: quest.status,
                monster: quest.monster,
                durationSeconds: quest.timeSeconds,
                formattedTime: formatTime(quest.timeSeconds),
                players: players
            };
            try {
                await window.MHDPSStorage.saveHunt(huntRecord);
                console.log("[MHDPS] Quest automatically saved to local IndexedDB.");
            } catch (err) {
                console.error("[MHDPS] Failed to auto-save hunt:", err);
            }
        }
    }

    // Build Dynamic Configurable Metrics Strip
    function buildMetricsHtml(player) {
        const cols = state.settings.columns || {};
        const details = player.details || {};
        let html = '';

        if (cols.dps) {
            html += `
                <div class="metric-box">
                    <span class="metric-value dps">${(player.dps || 0).toFixed(1)}</span>
                    <span class="metric-label">DPS</span>
                </div>
            `;
        }
        if (cols.totalDamage) {
            html += `
                <div class="metric-box">
                    <span class="metric-value">${(player.damage || 0).toLocaleString()}</span>
                    <span class="metric-label">${t('total')}</span>
                </div>
            `;
        }
        if (cols.highestHit) {
            html += `
                <div class="metric-box" title="${state.currentLang === 'en' ? 'Highest Single Damage Hit' : 'Höchster einzelner Schadenswert'}">
                    <span class="metric-value hit">${player.highestHit == null ? '—' : player.highestHit.toLocaleString()}</span>
                    <span class="metric-label">${t('maxHit')}</span>
                </div>
            `;
        }
        if (cols.highestCrit) {
            html += `
                <div class="metric-box" title="${state.currentLang === 'en' ? 'Highest Critical Hit' : 'Höchster kritischer Treffer'}">
                    <span class="metric-value crit">${player.highestCrit == null ? '—' : player.highestCrit.toLocaleString()}</span>
                    <span class="metric-label">${t('maxCrit')}</span>
                </div>
            `;
        }
        if (cols.monsterHits) {
            html += `
                <div class="metric-box" title="${state.currentLang === 'en' ? 'Hits Landed Count' : 'Anzahl gelandeter Treffer'}">
                    <span class="metric-value">${player.monsterHits || 0}</span>
                    <span class="metric-label">${t('hits')}</span>
                </div>
            `;
        }
        if (cols.healingDone) {
            html += `
                <div class="metric-box" title="${state.currentLang === 'en' ? 'Team Healing Output' : 'Verteilte Heilung an die Gruppe'}">
                    <span class="metric-value" style="color: #22c55e;">+${details.healingDone == null ? '—' : details.healingDone.toLocaleString()}</span>
                    <span class="metric-label">${t('healing')}</span>
                </div>
            `;
        }
        if (cols.palicoDamage) {
            html += `
                <div class="metric-box" title="${state.currentLang === 'en' ? 'Companion / Palico Damage' : 'Schaden des Jagdbegleiters'}">
                    <span class="metric-value" style="color: #f59e0b;">${details.companionDamage == null ? '—' : details.companionDamage.toLocaleString()}</span>
                    <span class="metric-label">${t('palico')}</span>
                </div>
            `;
        }
        if (cols.range) {
            let rangeLabel = player.rangeType;
            if (!rangeLabel) {
                rangeLabel = (player.weapon && player.weapon.includes('Bow')) ? t('ranged') : t('melee');
            } else if (state.currentLang === 'en') {
                if (rangeLabel.includes('Nah')) rangeLabel = 'Melee';
                else if (rangeLabel.includes('Fern')) rangeLabel = 'Ranged';
            } else {
                if (rangeLabel === 'Melee') rangeLabel = 'Nah';
                else if (rangeLabel === 'Ranged') rangeLabel = 'Fern';
            }
            html += `
                <div class="metric-box" title="${state.currentLang === 'en' ? 'Combat Range' : 'Kampf-Reichweite'}">
                    <span class="metric-value" style="font-size: 0.85rem;">${escapeHtml(rangeLabel)}</span>
                    <span class="metric-label">${t('range')}</span>
                </div>
            `;
        }

        return html;
    }

    // Render Players List
    function renderPlayers(players) {
        state.latestPlayers = players || [];
        if (!elements.huntersList) return;

        if (!players || players.length === 0) {
            if (window.MHDPSSharing?.isViewer) {
                elements.huntersList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-title">${t('emptyViewerTitle')}</div>
                        <div class="empty-state-subtitle">${t('emptyViewerSubtitle')}</div>
                    </div>
                `;
                return;
            }
            elements.huntersList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-title">${t('emptyTitle')}</div>
                </div>
            `;
            return;
        }

        // Sort by damage descending
        const sorted = [...players].sort((a, b) => b.damage - a.damage);

        elements.huntersList.innerHTML = sorted.map(player => {
            const isExpanded = state.expandedPlayerIds.has(String(player.id));
            const isSelf = player.isSelf;
            const weaponIcon = window.MHDPS_ICONS[player.weapon] || window.MHDPS_ICONS.GreatSword;
            const weaponName = escapeHtml(getWeaponName(player.weapon));
            const rankLabel = player.mr > 0 ? `MR ${player.mr}` : (player.hr ? `HR ${player.hr}` : 'HR —');
            const rankClass = player.mr > 0 ? 'rank-badge mr' : 'rank-badge hr';
            const details = player.details || {};
            const selfTagText = window.MHDPSSharing?.isViewer ? t('hostTag') : t('selfTag');

            let gameSpecificHtml = '';
            if (state.currentGame === 'wilds') {
                gameSpecificHtml = `
                    <div class="detail-row">
                        <span class="detail-row-label">${t('woundsOpened')}</span>
                        <span class="detail-row-val">${details.woundsOpened ?? '—'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-row-label">${t('focusStrikes')}</span>
                        <span class="detail-row-val">${details.focusStrikes ?? '—'}</span>
                    </div>
                `;
            } else if (state.currentGame === 'world') {
                gameSpecificHtml = `
                    <div class="detail-row">
                        <span class="detail-row-label">${t('tenderizes')}</span>
                        <span class="detail-row-val">${details.tenderizes || 0}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-row-label">${t('wallBangs')}</span>
                        <span class="detail-row-val">${details.wallBangs || 0}</span>
                    </div>
                `;
            } else if (state.currentGame === 'rise') {
                gameSpecificHtml = `
                    <div class="detail-row">
                        <span class="detail-row-label">${t('wyvernRides')}</span>
                        <span class="detail-row-val">${details.wyvernRides || 0}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-row-label">${t('wirebugCounters')}</span>
                        <span class="detail-row-val">${details.wirebugCounters || 0}</span>
                    </div>
                `;
            }

            const dynamicMetricsHtml = buildMetricsHtml(player);

            return `
                <div class="player-card ${isSelf ? 'is-self' : ''} ${isExpanded ? 'expanded' : ''}" data-player-id="${escapeHtml(player.id)}">
                    <!-- Compact Telemetry Row -->
                    <div class="player-compact-row">
                        <div class="player-identity-group">
                            <div class="${rankClass}">${rankLabel}</div>
                            
                            <div class="weapon-icon-wrap" title="${weaponName}">
                                ${weaponIcon}
                            </div>
                            <div class="player-names">
                                <span class="player-name">
                                    ${escapeHtml(player.name)}
                                    ${isSelf ? `<span class="self-tag">${selfTagText}</span>` : ''}
                                </span>
                                <span class="weapon-label">${weaponName}</span>
                            </div>
                        </div>

                        <!-- Configurable Metric Columns -->
                        <div class="player-metrics-wrap">
                            ${dynamicMetricsHtml}
                        </div>

                        <!-- Damage Share Progress Bar -->
                        <div class="damage-share-box">
                            <div class="damage-share-header">
                                <span>${t('share')}</span>
                                <span>${(player.damageShare || 0).toFixed(1)}%</span>
                            </div>
                            <div class="damage-bar-track">
                                <div class="damage-bar-fill" style="width: ${Math.min(100, Math.max(0, player.damageShare || 0))}%;"></div>
                            </div>
                        </div>

                        <div class="expand-chevron">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </div>
                    </div>

                    <!-- Expandable Detail Breakdown -->
                    <div class="player-details-panel">
                        <div class="details-grid">
                            <!-- Element & Raw Breakdown -->
                            <div class="detail-card">
                                <div class="detail-card-title">
                                    ${window.MHDPS_ICONS[details.element] || window.MHDPS_ICONS.Thunder}
                                    ${t('elementRaw')}
                                </div>
                                <div class="detail-row">
                                    <span class="detail-row-label">${t('type')}</span>
                                    <span class="detail-row-val">${escapeHtml(details.element || t('notRecorded'))}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-row-label">${t('rawDamage')}</span>
                                    <span class="detail-row-val">${details.rawDamage == null ? '—' : details.rawDamage.toLocaleString()}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-row-label">${t('elementDamage')}</span>
                                    <span class="detail-row-val">${details.elementEstimated ? t('elementEstimated') : (details.elementDamage == null ? '—' : details.elementDamage.toLocaleString())}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-row-label">${t('trueDamage')}</span>
                                    <span class="detail-row-val">${details.trueDamage == null ? '—' : details.trueDamage.toLocaleString()}</span>
                                </div>
                            </div>

                            <!-- Crowd Control -->
                            <div class="detail-card">
                                <div class="detail-card-title">
                                    ${window.MHDPS_ICONS.Knockout}
                                    ${t('crowdControl')}
                                </div>
                                <div class="detail-row">
                                    <span class="detail-row-label">${t('knockouts')}</span>
                                    <span class="detail-row-val">${details.knockouts ?? '—'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-row-label">${t('stuns')}</span>
                                    <span class="detail-row-val">${details.stuns ?? '—'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-row-label">${t('paralyzeSleep')}</span>
                                    <span class="detail-row-val">${details.paralyze == null || details.sleep == null ? '—' : details.paralyze + details.sleep}</span>
                                </div>
                                ${gameSpecificHtml}
                            </div>

                            <!-- Support & Healing -->
                            <div class="detail-card">
                                <div class="detail-card-title">
                                    ${window.MHDPS_ICONS.Heal}
                                    ${t('supportHealing')}
                                </div>
                                <div class="detail-row">
                                    <span class="detail-row-label">${t('teamHealingDone')}</span>
                                    <span class="detail-row-val">${details.healingDone == null ? '—' : details.healingDone.toLocaleString()} HP</span>
                                </div>
                            </div>

                            <!-- Companion / Palico -->
                            <div class="detail-card">
                                <div class="detail-card-title">
                                    ${window.MHDPS_ICONS.Palico}
                                    ${t('companionTitle')}
                                </div>
                                <div class="detail-row">
                                    <span class="detail-row-label">${t('companionDamage')}</span>
                                    <span class="detail-row-val">${details.companionDamage == null ? '—' : details.companionDamage.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Attach click listeners for card expansion
        document.querySelectorAll('.player-compact-row').forEach(row => {
            row.addEventListener('click', () => {
                const card = row.closest('.player-card');
                if (!card) return;
                const playerId = card.dataset.playerId;
                if (state.expandedPlayerIds.has(playerId)) {
                    state.expandedPlayerIds.delete(playerId);
                    card.classList.remove('expanded');
                } else {
                    state.expandedPlayerIds.add(playerId);
                    card.classList.add('expanded');
                }
            });
        });
    }

    // Handle incoming data packet
    function handleIncomingData(packet) {
        if (!packet) return;
        if (packet.game && packet.game !== state.currentGame) {
            setGameTheme(packet.game);
        }
        renderPlayers(packet.players);
        renderQuestHUD(packet.quest);
    }

    // Connection events
    window.MHDPSConnection.onData(handleIncomingData);

    window.MHDPSConnection.onStatusChange((status, message) => {
        if (window.MHDPSCombatSimulator?.isRunning) return;
        if (elements.connectionPill) {
            elements.connectionPill.className = `status-dot-wrap status-pill ${status}`;
            elements.connectionPill.title = message;
        }
        if (elements.connectionText) {
            elements.connectionText.textContent = message;
        }
    });

    // Toggle Simulator Mode
    if (elements.simToggleBtn) {
        elements.simToggleBtn.addEventListener('click', () => {
            if (window.MHDPSCombatSimulator.isRunning) {
                window.MHDPSCombatSimulator.stop();
                elements.simToggleBtn.classList.remove('active');
                elements.simToggleBtn.textContent = "Demo Simulator";
                if (elements.connectionPill) {
                    elements.connectionPill.className = 'status-dot-wrap status-pill disconnected';
                    elements.connectionPill.title = 'Warte auf Spiel...';
                }
                if (elements.connectionText) {
                    elements.connectionText.textContent = 'Warte auf Spiel...';
                }
            } else {
                window.MHDPSCombatSimulator.start(state.currentGame);
                elements.simToggleBtn.classList.add('active');
                elements.simToggleBtn.textContent = "Simulation Stoppen";
                if (elements.connectionPill) {
                    elements.connectionPill.className = 'status-dot-wrap status-pill demo';
                    elements.connectionPill.title = `Demo (${state.currentGame.toUpperCase()})`;
                }
                if (elements.connectionText) {
                    elements.connectionText.textContent = `Demo (${state.currentGame.toUpperCase()})`;
                }
            }
        });
    }

    // Auto-Save Button Toggle
    if (elements.autoSaveBtn) {
        elements.autoSaveBtn.addEventListener('click', () => {
            state.settings.autoSave = !state.settings.autoSave;
            window.MHDPSStorage.saveSettings(state.settings);
            elements.autoSaveBtn.classList.toggle('active', state.settings.autoSave);
            elements.autoSaveBtn.textContent = state.settings.autoSave ? 'Auto-Save Aktiv' : 'Auto-Save Aus';
        });
    }

    // Share Modal Open/Close
    if (elements.shareModalBtn && elements.shareModal) {
        elements.shareModalBtn.addEventListener('click', () => {
            elements.shareModal.classList.add('open');
        });
    }
    if (elements.closeShareModalBtn && elements.shareModal) {
        elements.closeShareModalBtn.addEventListener('click', () => {
            elements.shareModal.classList.remove('open');
        });
    }
    if (elements.dismissShareModalBtn && elements.shareModal) {
        elements.dismissShareModalBtn.addEventListener('click', () => {
            elements.shareModal.classList.remove('open');
        });
    }

    // History Modal Open/Close
    if (elements.historyBtn && elements.historyModal) {
        elements.historyBtn.addEventListener('click', async () => {
            elements.historyModal.classList.add('open');
            await loadHistoryList();
        });
    }
    if (elements.closeHistoryBtn && elements.historyModal) {
        elements.closeHistoryBtn.addEventListener('click', () => {
            elements.historyModal.classList.remove('open');
        });
    }

    async function loadHistoryList() {
        if (!elements.historyList) return;
        const hunts = await window.MHDPSStorage.getHunts(30);
        if (hunts.length === 0) {
            elements.historyList.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 24px;">Noch keine Quests lokal gespeichert.</p>`;
            return;
        }

        elements.historyList.innerHTML = hunts.map(hunt => {
            const topHunter = (hunt.players || []).reduce((max, p) => p.damage > (max ? max.damage : 0) ? p : max, null);
            return `
                <div class="history-item">
                    <div>
                        <strong>${escapeHtml(hunt.monster)}</strong> (${escapeHtml(hunt.game.toUpperCase())})<br>
                        <small style="color: var(--text-muted);">${hunt.dateStr} &bull; Dauer: ${hunt.formattedTime}</small>
                    </div>
                    <div style="text-align: right;">
                        <span style="color: var(--accent-primary); font-weight: bold;">Top: ${topHunter ? escapeHtml(topHunter.name) : 'N/A'}</span><br>
                        <small style="font-family: var(--font-mono);">${topHunter ? topHunter.dps.toFixed(1) + ' DPS' : ''}</small>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (elements.clearHistoryBtn) {
        elements.clearHistoryBtn.addEventListener('click', async () => {
            if (confirm("Möchtest du wirklich die gesamte lokale Quest-Historie im Browser löschen?")) {
                await window.MHDPSStorage.clearHistory();
                await loadHistoryList();
            }
        });
    }

    if (elements.exportAllJsonBtn) {
        elements.exportAllJsonBtn.addEventListener('click', async () => {
            const hunts = await window.MHDPSStorage.getHunts(200);
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(hunts, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `mhdps_history_${Date.now()}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        });
    }

    // Settings Modal & Column Checkboxes
    function initSettingsUI() {
        if (elements.columnsCheckboxGrid?.querySelectorAll) {
            const cols = state.settings.columns || {};
            elements.columnsCheckboxGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                const colKey = cb.dataset.col;
                if (cols[colKey] !== undefined) {
                    cb.checked = !!cols[colKey];
                }
                cb.addEventListener('change', () => {
                    state.settings.columns[colKey] = cb.checked;
                    window.MHDPSStorage.saveSettings(state.settings);
                    renderPlayers(state.latestPlayers);
                });
            });
        }

        if (elements.langDeBtn?.addEventListener) {
            elements.langDeBtn.addEventListener('click', () => applyLanguage('de'));
        }
        if (elements.langEnBtn?.addEventListener) {
            elements.langEnBtn.addEventListener('click', () => applyLanguage('en'));
        }
    }
    initSettingsUI();

    if (elements.settingsBtn && elements.settingsModal) {
        elements.settingsBtn.addEventListener('click', () => {
            elements.settingsModal.classList.add('open');
        });
    }

    if (elements.closeSettingsBtn && elements.settingsModal) {
        elements.closeSettingsBtn.addEventListener('click', () => {
            elements.settingsModal.classList.remove('open');
        });
    }

    if (elements.saveSettingsBtn && elements.settingsModal) {
        elements.saveSettingsBtn.addEventListener('click', () => {
            elements.settingsModal.classList.remove('open');
        });
    }

    // Close modals on outside backdrop click
    [elements.shareModal, elements.historyModal, elements.settingsModal].forEach(modal => {
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('open');
        });
    });

    // Manual Game Selector on Badge Click
    if (elements.gameBadge) {
        elements.gameBadge.addEventListener('click', () => {
            if (window.MHDPSSharing?.isViewer) return;
            const games = ['wilds', 'world', 'rise'];
            const nextIdx = (games.indexOf(state.currentGame) + 1) % games.length;
            const nextGame = games[nextIdx];
            setGameTheme(nextGame);
            if (window.MHDPSCombatSimulator?.isRunning) {
                window.MHDPSCombatSimulator.start(nextGame);
                if (elements.connectionText) {
                    elements.connectionText.textContent = `Demo (${nextGame.toUpperCase()})`;
                }
                if (elements.connectionPill) {
                    elements.connectionPill.title = `Demo (${nextGame.toUpperCase()})`;
                }
            }
        });
    }

    // Testing & Screenshot automation
    const urlParams = typeof URLSearchParams !== 'undefined' && window.location?.search
        ? new URLSearchParams(window.location.search)
        : null;

    window.MHDPSMonsterPanel?.init(state.settings);
    const initialLang = urlParams?.get('lang') || state.settings?.language || 'de';
    applyLanguage(initialLang);

    // Initialize Connection on start
    const isViewer = window.MHDPSSharing?.init() || false;
    if (!isViewer) window.MHDPSConnection.init(state.settings.websocketPort || 9999);

    if (state.latestPlayers.length === 0) {
        renderPlayers([]);
    }
});
