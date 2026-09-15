# MHDPS 0.1.5 — architecture and data handling

Mod: https://www.nexusmods.com/monsterhunterwilds/mods/4882
Author: Sengakuji / by Sengakujiworks
Purpose: show Monster Hunter Wilds hunt damage statistics in a browser.
Scope: release 0.1.5.

## Startup and process behavior

REFramework loads the Lua script from autorun and the native plugin from
plugins. The plugin exports reframework_plugin_initialize. Since 0.1.5 the
plugin DLL is the complete local server: it does not launch any external
process and the release contains no executable. Two threads start inside the
game process and end with it:

- an HTTP server on 127.0.0.1:8080 serving the bundled web directory and
  /health, with directory listing disabled and path traversal rejected;
- a WebSocket relay on 127.0.0.1:9999 broadcasting the telemetry file.

Initialization has a guard against repeated initialization of the same loaded
plugin. Ports can be overridden with the MHDPS_HTTP_PORT / MHDPS_WS_PORT
environment variables. No Windows service, scheduled task, registry autorun
or updater is installed, and no administrator elevation is requested. A
bounded diagnostic log is written to %LOCALAPPDATA%/MHDPS/server.log.
The former 0.1.4 architecture (bootstrap DLL starting a PyInstaller EXE via
CreateProcessW) is retired; its Python sources remain under source/relay for
reference only and are not built or shipped.

The Lua script uses REFramework SDK hooks to observe quest/combat data; read
the script for exact hooks. It does not intentionally change damage values or
player progression. The browser no longer opens automatically: the dashboard's
setup page offers the choice between the public homepage and the local view
the first time it is opened.

## Files and local storage

- Game mod writes reframework/data/dps_live.json with current telemetry.
- The native relay reads that file (150 ms poll, 5 s freshness window, 2 MB
  cap, torn-write protection) and fixes Lua's empty player table {} to []
  because the dashboard requires an array.
- Bounded diagnostic log: %LOCALAPPDATA%/MHDPS/server.log.
- Dashboard stores settings/history locally using browser storage/IndexedDB.
- Publisher credentials for a share session are held in browser sessionStorage.

Local health/status can include the telemetry path. It is excluded from the
spectator server's output schema. The relay log may contain local paths.

## Connections and optional sharing

- The relay listens on 127.0.0.1:9999 (WebSocket) and 127.0.0.1:8080 (HTTP)
  inside the game process. It does not bind these listeners to public
  interfaces. Environment-variable port overrides exist.
- WebSocket origins are allowlisted in native/server.c, including the public
  site and local development origins. No authentication secret is required
  for local data.
- Browser opens https://mhdps.sengakujiworks.com or http://localhost:8080.
  Loading the public website creates normal web requests even without sharing.
- Only explicit sharing creates a room and uploads hunt data through browser
  HTTPS requests to /api/share/rooms on the public website. The mod itself
  does not upload combat data to a remote server.
- Shared data includes player names/IDs, weapons, hunt status/timing, monster HP,
  part data and combat statistics. It is not anonymous. Anyone possessing a
  valid viewer link can view its room. Publisher and viewer tokens are separate.
- Backend filters fields and excludes local paths and SDK diagnostic payloads.
  Rooms are in process memory, with defaults of four-hour TTL and ten-minute
  owner inactivity timeout. Restart discards rooms. Normal proxy/server request
  metadata handling is separate from the combat-data storage described here.
- Spectator mode does not initiate the viewer's local relay connection.
- No browser/antivirus protection settings are disabled by this software.

## Build and validation limits

0.1.5 contains no ZIP/7z/RAR members and no executable files of any kind; the
only binary is the unsigned native plugin DLL. The source and pinned build
dependencies are available in this repository. The release manifest records
the distributed files.

Functional tests cover the HTTP server, /health, path traversal rejection and
the complete WebSocket contract, plus frontend logic. These are not malware
assessments or independent security certification. The distributed DLL is
unsigned. Multiplayer attribution and part durability remain under development.
