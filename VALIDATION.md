# Release build validation â€” 2026-09-14

The supplied build.ps1 completed from this separate source snapshot on Windows
x64 using the existing installed tool versions recorded in requirements-build.txt.
A fresh virtual environment dependency installation was documented but not run.
Both the DLL and EXE compiled, and the rebuilt mod ZIP passed CRC validation.
Rebuilt member names exactly match the original local 0.1.4 ZIP. All nonbinary
payload bytes are identical. Original release ZIP was left unchanged.

Binary byte comparisons against the original release:
- reframework/plugins/MHDPS-Bootstrap.dll: different; no byte-reproducibility claim
- reframework/mhdps/MHDPS-Companion.exe: different; no byte-reproducibility claim

The startup tests (3) and relay tests (5) passed locally. They check functionality,
not malware safety. Intentional rejection of an unrelated WebSocket origin logs
an expected handshake error during a passing negative test.
Original EXE and DLL Authenticode status: NotSigned.

The source snapshot excludes build outputs, local build logs, caches, virtual
environments and the original binary mod ZIP. Build dependencies are fetched
from the Python package index by the documented build step.
Source and build scripts are publicly available alongside the release.
