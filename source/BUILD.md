# Building MHDPS 0.1.5

Windows x64; original build used CPython 3.10.11 (64-bit). Exact pinned package
versions are in requirements-build.txt. The compiler is ziglang 0.16.0 targeting
x86_64-windows-gnu, linked against ws2_32 only. No signing step, packer or
obfuscator is used. Since 0.1.5 the release contains **no executable**: the
former PyInstaller companion was replaced by an in-process native relay inside
the REFramework plugin DLL, so there is no PyInstaller step anymore.
relay/relay.py and relay/startup.py are kept as retired reference sources for
the 0.1.4 architecture; they are not built or shipped.

From this source directory in PowerShell:

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-build.txt
$env:PATH = (Join-Path $PWD '.venv\Scripts') + ';' + $env:PATH
.\build.ps1
```

Use a PowerShell environment that permits local build scripts.
No elevation is required. Output: build/MHDPS-Wilds-0.1.5-rebuilt.zip.
Do not install or execute the resulting mod to inspect source. To test the
native relay and the retired Python reference separately, use:

```powershell
python -m unittest discover -s tests -p test_native_server.py -v
python -m unittest discover -s tests -p test_startup.py -v
python -m unittest discover -s tests -p test_relay.py -v
```

test_native_server.py loads the built DLL, then checks the dashboard HTTP
server, /health, path traversal protection and the complete WebSocket contract
(status snapshots, origin allowlist, players {} -> [] fixup, staleness).

Original ZIP member hashes are in ../RELEASE-MANIFEST.json. Payload files were
copied byte-for-byte from that ZIP. Compiler timestamps, environment and build
paths may change rebuilt hashes; reproducible byte-identical builds have not
been proven. The C/Python source is the retained build source, not
reverse-engineered code.

Source layout: native/server.c builds the REFramework plugin DLL that runs the
dashboard HTTP server (127.0.0.1:8080) and the telemetry WebSocket
(127.0.0.1:9999) inside the game process. payload contains the shipped Lua, web
frontend and artwork. relay contains the retired 0.1.4 Python companion for
reference. server contains the optional spectator backend and Nginx routing
for reference; they run on the website server, not inside the mod.
REFramework itself is a separate prerequisite and is not bundled.
