MHDPS 0.1.5 — by Sengakujiworks

Download **MHDPS-Wilds-0.1.5.zip**, import it into Vortex, then activate
**MHDPS Wilds - Web DPS Meter** in Fluffy Mod Manager. REFramework is required.
Use the mod ZIP below, not the automatic Source code archives.

0.1.5 removes the bundled executable entirely. The dashboard HTTP server and
the telemetry WebSocket now run inside the REFramework plugin DLL, in the game
process. This addresses the automated malware-scanner false positives that
quarantined the 0.1.4 upload: that release's PyInstaller EXE alone scored
12/70 on VirusTotal while the plugin DLL scored 2/70. The WebSocket/HTTP
contract, the local dashboard and the spectator integration are unchanged.

Start Wilds, then open https://mhdps.sengakujiworks.com (with spectator
sharing) or http://localhost:8080 in your browser. Ports can be overridden
with the MHDPS_HTTP_PORT / MHDPS_WS_PORT environment variables if needed.

Dashboard and spectator sharing: https://mhdps.sengakujiworks.com
Open the homepage, click the share icon, and send the generated link to friends.
Viewers only need a browser; keep the host game and tab open.

Part durability and multiplayer attribution remain experimental.
Source and build instructions are in the repository.
