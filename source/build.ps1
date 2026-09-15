$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
New-Item -ItemType Directory -Force -Path build | Out-Null
# Single native relay DLL: dashboard HTTP + telemetry WebSocket in-process.
# Since 0.1.5 the release contains no executable.
python -m ziglang cc -target x86_64-windows-gnu -shared -O2 native/server.c -o build/MHDPS-Bootstrap.dll -lws2_32
if ($LASTEXITCODE) { throw 'Native relay build failed' }
python assemble.py
if ($LASTEXITCODE) { throw 'Assembly failed' }
