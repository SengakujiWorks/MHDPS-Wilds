$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
New-Item -ItemType Directory -Force -Path build | Out-Null
python -m ziglang cc -target x86_64-windows-gnu -shared -O2 native/bootstrap.c -o build/MHDPS-Bootstrap.dll -luser32
if ($LASTEXITCODE) { throw 'Native build failed' }
python -m PyInstaller --noconfirm --onefile --noconsole --name MHDPS-Companion --distpath build/companion --workpath build/pyinstaller --specpath build relay/relay.py
if ($LASTEXITCODE) { throw 'Companion build failed' }
python assemble.py
if ($LASTEXITCODE) { throw 'Assembly failed' }
