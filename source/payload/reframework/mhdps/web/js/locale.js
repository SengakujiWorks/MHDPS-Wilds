/* Dynamic connection and sharing messages, alongside the dashboard dictionaries. */
window.MHDPSLocale = {
    language: 'de',
    setLanguage(value) { this.language = value === 'en' ? 'en' : 'de'; },
    translate(value) {
        if (this.language !== 'en') return value;
        if (Object.hasOwn(this.messages, value)) return this.messages[value];
        const expires = /^Freigabe aktiv bis (.+)\. Jeder mit dem Link kann deine Kampfwerte sehen\. Diesen Tab offen lassen\.$/.exec(value);
        if (expires) return `Sharing active until ${expires[1]}. Anyone with the link can view your combat data. Keep this tab open.`;
        const age = /^Keine neuen Daten vom Gastgeber seit (\d+) Sekunden\. Anzeige zeigt den letzten Stand\.$/.exec(value);
        if (age) return `No new host data for ${age[1]} seconds. Showing the last received snapshot.`;
        return value;
    },
    messages: {
    "Verbinde...": "Connecting…",
    "Relay verbunden – warte auf Spieldaten": "Companion connected — waiting for game data",
    "Live · Quest aktiv": "Quest active",
    "Live · Spiel erkannt": "Game detected",
    "Mod-Fehler: REFramework-Menü prüfen": "Mod error: check the REFramework menu",
    "Begleiter starten / lokalen Zugriff erlauben": "Start companion / allow local access",
    "Warte auf Spiel...": "Waiting for game…",
    "Spieldaten empfangen": "Game data received",
    "Relay bereit - warte auf Mod-Daten": "Companion ready — waiting for mod data",
    "Keine aktuellen Spieldaten - Spiel / MHDPS-Mod pruefen": "No fresh game data — check Wilds and the mod",
    "Dieser Zuschauerlink ist ungültig.": "This spectator link is invalid.",
    "Ungültiger Zuschauerlink": "Invalid spectator link",
    "Zum Teilen die Homepage mhdps.sengakujiworks.com öffnen.": "Open mhdps.sengakujiworks.com to share.",
    "Freigabe beendet oder Dienst noch nicht bereit.": "Sharing ended or the service is not ready.",
    "Freigabe-Dienst nicht erreichbar. Bitte erneut versuchen.": "Sharing service unavailable. Please try again.",
    "Zuerst Begleiter und Wilds verbinden. Sobald Spieldaten eintreffen, kannst du teilen.": "Connect the companion and Wilds first. Sharing becomes available when game data arrives.",
    "Freigabe abgelaufen. Du kannst einen neuen Link erstellen.": "Sharing expired. You can create a new link.",
    "Freigabe beendet oder abgelaufen. Erstelle bei Bedarf einen neuen Link.": "Sharing ended or expired. Create a new link if needed.",
    "Übertragung unterbrochen. Verbindung wird erneut versucht; dein lokales DPS-Meter läuft weiter.": "Transmission interrupted. Reconnecting; your local DPS meter continues running.",
    "Freigabe beendet. Der Zuschauerlink ist jetzt ungültig.": "Sharing ended. The spectator link is now invalid.",
    "Freigabe bereits beendet.": "Sharing has already ended.",
    "Beenden nicht bestätigt. Upload pausiert. Bitte erneut „Freigabe beenden“ klicken; ohne Upload endet die Freigabe spätestens nach 10 Minuten.": "Stop was not confirmed. Upload paused. Click Stop sharing again; without uploads the session expires within 10 minutes.",
    "Kopiert": "Copied",
    "Link kopieren": "Copy link",
    "Link markiert – bitte mit Strg+C kopieren.": "Link selected — press Ctrl+C to copy.",
    "Zuschaueransicht wird verbunden …": "Connecting spectator view…",
    "Live · Zuschauer": "Spectator connected",
    "Zuschauer · warte auf Gastgeber": "Spectator — waiting for host",
    "Du siehst die vom Gaming-PC des Gastgebers erfassten Werte.": "You are viewing data recorded by the host’s gaming PC.",
    "Freigabe verbunden. Der Gastgeber hat noch keine Spieldaten übertragen.": "Sharing connected. The host has not sent game data yet.",
    "Freigabe beendet": "Sharing ended",
    "Zuschauer · Verbindung unterbrochen": "Spectator — connection interrupted",
    "Diese Freigabe wurde beendet oder ist abgelaufen. Bitte den Gastgeber um einen neuen Link bitten.": "Sharing ended or expired. Ask the host for a new link.",
    "Verbindung unterbrochen. Die Zuschaueransicht verbindet sich automatisch erneut.": "Connection interrupted. The spectator view reconnects automatically."
}
};
