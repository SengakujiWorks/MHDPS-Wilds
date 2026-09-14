/* MHDPS: REFramework calls initialize outside the Windows loader lock.
 * Launch only our bundled executable; no shell, downloads or game hooks. */
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <wchar.h>
#include <stdbool.h>

__declspec(dllexport) bool reframework_plugin_initialize(const void *unused) {
    (void)unused;
    static LONG started = 0;
    if (InterlockedExchange(&started, 1)) return true;
    HMODULE module = NULL;
    wchar_t root[32768], exe[32768], command[32768];
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
            GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            (LPCWSTR)&reframework_plugin_initialize, &module)) return false;
    DWORD length = GetModuleFileNameW(module, root, 32768);
    if (!length || length >= 32000) return false;
    for (int i = 0; i < 3; ++i) {
        wchar_t *slash = wcsrchr(root, L'\\');
        if (!slash) return false;
        *slash = 0;
    }
    if (swprintf(exe, 32768, L"%ls\\reframework\\mhdps\\MHDPS-Companion.exe", root) < 0) return false;
    if (GetFileAttributesW(exe) == INVALID_FILE_ATTRIBUTES) {
        MessageBoxW(NULL, L"MHDPS: Das Mod-Paket ist unvollstaendig. Bitte das komplette ZIP ueber Vortex/Fluffy neu aktivieren.", L"MHDPS", MB_OK | MB_ICONERROR);
        return false;
    }
    if (swprintf(command, 32768, L"\"%ls\" --autostart --game-dir \"%ls\" --game-pid %lu", exe, root, GetCurrentProcessId()) < 0) return false;
    STARTUPINFOW si = {0}; si.cb = sizeof(si);
    PROCESS_INFORMATION pi = {0};
    if (!CreateProcessW(exe, command, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, root, &si, &pi)) {
        MessageBoxW(NULL, L"MHDPS: Der Begleiter konnte nicht gestartet werden. Bitte pruefe, ob das vollstaendige Mod-Paket aktiviert ist.", L"MHDPS", MB_OK | MB_ICONERROR);
        return false;
    }
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
    return true;
}
