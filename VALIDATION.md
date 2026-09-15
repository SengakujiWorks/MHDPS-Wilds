# Release build validation — 2026-09-15

The 0.1.5 build (source/build.ps1) runs zig cc 0.16.0 targeting
x86_64-windows-gnu with -lws2_32 only; PyInstaller is no longer part of the
build. The rebuilt mod ZIP passes CRC validation and its member names exactly
match the shipped 0.1.5 ZIP. All nonbinary payload bytes are identical.
Original release ZIP was left unchanged.

Binary byte comparisons against the original release:
- reframework/plugins/MHDPS-Bootstrap.dll: different; no byte-reproducibility claim
- reframework/mhdps/MHDPS-Companion.exe: removed in 0.1.5 (no executable ships)

The native relay tests (5) passed locally: HTTP static serving, /health, path
traversal rejection, WebSocket handshake with origin allowlist (403 for
unrelated origins), relay_status snapshots, players {} -> [] fixup, oversize
rejection and the stale transition. A regression guard confirms the plugin no
longer spawns any companion process. The retired Python reference sources
still pass their own unit tests (test_relay, test_startup). These check
functionality, not malware safety. Original DLL Authenticode status: NotSigned.

The source snapshot excludes build outputs, local build logs, caches, virtual
environments and the original binary mod ZIP. Build dependencies are fetched
from the Python package index by the documented build step.
Source and build scripts are publicly available alongside the release.
