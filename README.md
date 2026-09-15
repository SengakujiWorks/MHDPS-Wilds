# MHDPS — Monster Hunter Wilds DPS Mod
**by Sengakujiworks**

MHDPS is a mod for Monster Hunter Wilds by Sengakujiworks. View your hunt statistics in a browser on your second
monitor. Share your current hunt with friends through a spectator link.

**[Download MHDPS 0.1.5](https://github.com/SengakujiWorks/MHDPS-Wilds/releases/download/v0.1.5/MHDPS-Wilds-0.1.5.zip)** ·
**[Open the dashboard](https://mhdps.sengakujiworks.com)** ·
[Nexus Mods](https://www.nexusmods.com/monsterhunterwilds/mods/4882)

## Features

- DPS, total damage, damage share, highest hit and weapon icons.
- Optional monster HP and experimental part durability display.
- Optional animated purple border around the monster panel.
- Spectator links: viewers only need a browser.
- German and English interface, with local quest history.
- Local relay starts automatically with the game — no companion program.
- Since 0.1.5 the package contains **no executable** at all.

## Installation — Vortex and Fluffy

Requires Monster Hunter Wilds on Windows, compatible REFramework, Vortex and
Fluffy Mod Manager. Close the game before installing or updating.

1. Download **MHDPS-Wilds-0.1.5.zip** from [GitHub Releases](https://github.com/SengakujiWorks/MHDPS-Wilds/releases/latest).
2. Drag the ZIP into Vortex, then install and enable it.
3. Open Fluffy Mod Manager and refresh the mod list.
4. Activate **MHDPS Wilds - Web DPS Meter** and start Wilds.

Use the named MHDPS ZIP, not GitHub's automatically generated **Source code**
archives. Everything MHDPS needs is included; no separate Python installation,
manual startup script or companion executable is required. When updating,
deactivate the previous MHDPS version in Fluffy before replacing it through
Vortex.

## First launch

Start Wilds, then open the dashboard in your browser:

- **Homepage:** https://mhdps.sengakujiworks.com — includes spectator sharing.
- **Local:** http://localhost:8080 — for your own display.

The setup page remembers your choice for future sessions. If the public
homepage asks for local-network access, allow it so the browser can receive
data from the relay running inside the game on your PC. If ports 8080/9999 are
already in use on your machine, override them with the `MHDPS_HTTP_PORT` /
`MHDPS_WS_PORT` environment variables.

## Share your hunt

Open [mhdps.sengakujiworks.com](https://mhdps.sengakujiworks.com) on your gaming
PC, click the share icon, and send the generated link to your friends.
Keep the game and host browser tab open while sharing. Viewers do not need to
install the mod. The local dashboard does not provide spectator links.

Game data stays local unless you start sharing. Sharing sends player names and
combat statistics through the website's server. Quest history stays in your browser.

## Source and development

- [Build instructions](source/BUILD.md) · [Build dependencies](source/requirements-build.txt)
- [Game telemetry](source/payload/reframework/autorun/MHDPS.lua)
- [Native relay](source/native/server.c) — dashboard HTTP + telemetry WebSocket in-process
- [Retired 0.1.4 companion (reference)](source/relay/relay.py) · [Preferences and lifecycle (reference)](source/relay/startup.py)
- [Browser frontend](source/payload/reframework/mhdps/web) · [Sharing backend](source/server/share-server.mjs)
- [Architecture and data handling](ARCHITECTURE.md)
- [Release checksums](SHA256SUMS.txt) · [File manifest](RELEASE-MANIFEST.json)
- [Build validation](VALIDATION.md)

DPS uses elapsed quest time. Unavailable values appear as **—**. Multiplayer
attribution and part durability are still being tested; parts currently use
numbered labels. Builds are not guaranteed to be byte-identical across environments.
Third-party names and artwork retain their respective rights.
