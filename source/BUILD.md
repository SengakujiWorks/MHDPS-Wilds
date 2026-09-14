# Building MHDPS 0.1.4

Windows x64; original build used CPython 3.10.11 (64-bit), including Tcl/Tk.
Exact observed package versions are in requirements-build.txt. The compiler is
ziglang 0.16.0 targeting x86_64-windows-gnu; PyInstaller is 6.22.2 in onefile,
noconsole mode. No signing step or external obfuscator was used. PyInstaller
spec defaults permit UPX if installed; the original logged command did not pass
an explicit UPX option. This bundle does not claim a deterministic binary build.

From this source directory in PowerShell:

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-build.txt
$env:PATH = (Join-Path $PWD '.venv\Scripts') + ';' + $env:PATH
.\build.ps1
```

Use a PowerShell environment that permits local build scripts.
No elevation is required. Output: build/MHDPS-Wilds-0.1.4-rebuilt.zip.
Do not install or execute the resulting mod to inspect source. To test the
startup/preferences and loopback relay separately, use:

```powershell
python -m unittest discover -s tests -p test_startup.py -v
python -m unittest discover -s tests -p test_relay.py -v
```

Original ZIP member hashes are in ../RELEASE-MANIFEST.json. Payload files were
copied byte-for-byte from that ZIP. The EXE and DLL hashes match the retained
build outputs. Compiler/packager timestamps, environment and build paths may
change rebuilt hashes; reproducible byte-identical builds have not been proven.
The C/Python source is the retained build source, not reverse-engineered code.

Source layout: native/bootstrap.c builds the REFramework loader; relay/relay.py
and relay/startup.py build the companion. payload contains the shipped Lua,
web frontend and artwork. server contains the optional spectator backend and
Nginx routing for reference; they run on the website server, not inside the mod.
REFramework itself is a separate prerequisite and is not bundled.
