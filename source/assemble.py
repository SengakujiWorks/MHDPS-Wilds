from pathlib import Path
import zipfile
root=Path(__file__).resolve().parent
entries=[(p,p.relative_to(root/'payload').as_posix()) for p in (root/'payload').rglob('*') if p.is_file()]
entries += [(root/'build/MHDPS-Bootstrap.dll','reframework/plugins/MHDPS-Bootstrap.dll'),(root/'build/companion/MHDPS-Companion.exe','reframework/mhdps/MHDPS-Companion.exe')]
assert not any(Path(n).suffix.lower() in {'.zip','.7z','.rar'} for _,n in entries)
output=root/'build/MHDPS-Wilds-0.1.4-rebuilt.zip'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
    for p,n in sorted(entries,key=lambda item:item[1]): z.write(p,n)
with zipfile.ZipFile(output) as z: assert z.testzip() is None
print(output)
