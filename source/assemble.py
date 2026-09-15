"""Assemble the 0.1.5 mod ZIP: payload plus the native relay DLL, nothing else.

The release must not contain any executable: the dashboard HTTP server and the
telemetry WebSocket run inside the REFramework plugin DLL (native/server.c).
"""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
EXECUTABLE_SUFFIXES = {'.exe', '.bat', '.cmd', '.com', '.scr', '.msi', '.ps1', '.vbs', '.jar'}
entries = [(p, p.relative_to(root / 'payload').as_posix())
           for p in (root / 'payload').rglob('*') if p.is_file()]
entries += [(root / 'build/MHDPS-Bootstrap.dll', 'reframework/plugins/MHDPS-Bootstrap.dll')]
assert not any(Path(n).suffix.lower() in {'.zip', '.7z', '.rar'} for _, n in entries), 'nested archives'
assert not any(Path(n).suffix.lower() in EXECUTABLE_SUFFIXES for _, n in entries), 'no executables allowed'
assert [n for _, n in entries if n.lower().endswith('.dll')] == ['reframework/plugins/MHDPS-Bootstrap.dll']
output = root / 'build/MHDPS-Wilds-0.1.5-rebuilt.zip'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
    for p, n in sorted(entries, key=lambda item: item[1]):
        z.write(p, n)
with zipfile.ZipFile(output) as z:
    assert z.testzip() is None
print(output)
