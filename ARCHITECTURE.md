# MHDPS 0.1.4 — architecture and data handling

Mod: https://www.nexusmods.com/monsterhunterwilds/mods/4882
Author: Sengakuji / by Sengakujiworks
Purpose: show Monster Hunter Wilds hunt damage statistics in a browser.
Scope: release 0.1.4.

## Startup and executable behavior

REFramework loads the Lua script in autorun and the native plugin from plugins.
The bootstrap exports reframework_plugin_initialize. It derives the bundled
companion path from its own module path and launches that exact EXE using
CreateProcessW with CREATE_NO_WINDOW, the game directory and game PID. It does
not call a command shell or download executables. Initialization has a guard
against repeated launches from the same loaded plugin. Missing/failed launches
produce an error dialog.

The EXE is a PyInstaller onefile Python application. The PyInstaller runtime
extracts its bundled runtime to a temporary directory. It is not merely a Lua
mod; this executable and DLL provide the requested automatic browser workflow.
The companion uses a session-local named mutex to prevent duplicate instances.
OpenProcess requests SYNCHRONIZE (0x100000) to monitor game exit, not process
memory access. It does not inject code into the game. The Lua script uses
REFramework SDK hooks to observe quest/combat data; read the script for exact hooks.
It does not intentionally change damage values or player progression.

After loopback listeners start, a DE/EN dialog lets the user choose the public
homepage or local view. The choice is remembered. The default browser opens the
chosen fixed URL; closing the dialog skips opening it. No Windows service,
scheduled task, registry autorun or updater is installed. The automatically
launched companion exits when the supplied game process exits. Manual mode can
remain running until closed. No request for administrator elevation is made.

## Files and local storage

- Game mod writes reframework/data/dps_live.json with current telemetry.
- Companion reads that file. Auto-start passes the actual game directory.
- Fallback discovery reads Steam libraryfolders.vdf and the Steam registry path;
  CLI/environment overrides exist for local development and manual use.
- Preference: %LOCALAPPDATA%/MHDPS/startup.json (atomic temporary-file replacement).
- Rotating diagnostic log: %LOCALAPPDATA%/MHDPS/companion.log and backups.
- PyInstaller uses temporary runtime extraction files.
- Dashboard stores settings/history locally using browser storage/IndexedDB.
- Publisher credentials for a share session are held in browser sessionStorage.

The HTTP server serves the bundled web directory and /health, with directory
listing disabled; it does not expose the game directory as its document root.
Local health/status can include the telemetry path. It is excluded from the
spectator server's output schema. The companion log may contain local paths.

## Connections and optional sharing

- Companion listens on 127.0.0.1:9999 (WebSocket) and 127.0.0.1:8080 (HTTP).
  It does not bind these listeners to public interfaces. CLI port overrides exist.
- WebSocket origins are allowlisted in relay.py, including the public site and
  local development origins. No authentication secret is required for local data.
- Browser opens https://mhdps.sengakujiworks.com or http://localhost:8080.
  Loading the public website creates normal web requests even without sharing.
- Only explicit sharing creates a room and uploads hunt data through browser
  HTTPS requests to /api/share/rooms on the public website. The companion itself
  does not upload combat data to a remote server.
- Shared data includes player names/IDs, weapons, hunt status/timing, monster HP,
  part data and combat statistics. It is not anonymous. Anyone possessing a
  valid viewer link can view its room. Publisher and viewer tokens are separate.
- Backend filters fields and excludes local paths and SDK diagnostic payloads.
  Rooms are in process memory, with defaults of four-hour TTL and ten-minute
  owner inactivity timeout. Restart discards rooms. Normal proxy/server request
  metadata handling is separate from the combat-data storage described here.
- Spectator mode does not initiate the viewer's local companion connection.
- No browser/antivirus protection settings are disabled by this software.

## Build and validation limits

0.1.4 contains no ZIP/7z/RAR members. The PyInstaller executable bundles its
runtime internally. The source and pinned build dependencies are available in
this repository. The release manifest records the distributed files.

Functional tests cover startup arguments, singleton behavior, process lifetime,
transport and frontend logic. These are not malware assessments or independent
security certification. The distributed EXE and DLL are unsigned. Multiplayer
attribution and part durability remain under development.
