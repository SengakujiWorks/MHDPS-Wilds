/* MHDPS native relay: in-process loopback web server for REFramework.
 * Replaces the former Python companion (0.1.4) with zero external
 * processes, so the mod package ships no executable at all.
 *
 * REFramework loads this DLL as a plugin and calls
 * reframework_plugin_initialize outside the Windows loader lock.
 * Two threads then run for the lifetime of the game process:
 *   HTTP 127.0.0.1:8080  bundled dashboard in reframework/mhdps/web
 *                     plus /health with the relay status snapshot
 *   WS   127.0.0.1:9999 broadcasts reframework/data/dps_live.json,
 *                     matching the relay.py 0.1.4 client contract:
 *                     relay_status snapshots (waiting/live/stale),
 *                     5 s staleness, 2 MB cap, players {} -> [] fixup
 *                     and the same origin allowlist.
 * Ports can be overridden with MHDPS_HTTP_PORT / MHDPS_WS_PORT.
 * The public dashboard https://mhdps.sengakujiworks.com keeps working
 * because that origin is allowed to open the local WebSocket. */
#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <wchar.h>
#include <ctype.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define HTTP_PORT_DEFAULT 8080
#define WS_PORT_DEFAULT 9999
#define TELEMETRY_MAX 2000000u          /* parity: 2 MB cap */
#define TELEMETRY_HARD_MAX 2100000u
#define STALE_AFTER 5.0                 /* seconds until data counts as stale */
#define POLL_MS 150                     /* telemetry poll interval */
#define CLIENT_MAX 32
#define CLIENT_RECV_MAX 4096            /* parity: websockets max_size */
#define HTTP_REQUEST_MAX 8192
#define STATUS_MAX 8192
#define IO_TIMEOUT_MS 3000
#define SEND_BUDGET_MS 2000             /* parity: 2 s per broadcast client */
#define BIND_RETRY_MS 5000

static const char WS_GUID[] = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
static const char *const ORIGINS[] = {
    "https://mhdps.sengakujiworks.com",
    "http://localhost:8080", "http://127.0.0.1:8080",
    "http://localhost:8085", "http://127.0.0.1:8085",
};

enum { STATE_WAITING = 0, STATE_LIVE = 1, STATE_STALE = 2 };

typedef struct {
    SOCKET sock;
    unsigned char leftover[CLIENT_RECV_MAX];
    size_t leftover_len;
} client_t;

static struct {
    volatile LONG started;
    volatile LONG stopping;
    wchar_t root[2048];
    wchar_t telemetry[2048 + 64];
    wchar_t web_root[2048 + 64];
    char telemetry_utf8[6144];          /* JSON-escaped display path */
    int http_port, ws_port;
    /* Shared relay snapshot: written by the WS thread, read by /health. */
    CRITICAL_SECTION state_lock;
    int state;
    double last_seen;                   /* unix seconds of accepted data */
} g;

static struct {
    client_t clients[CLIENT_MAX];
    size_t count;
    char *payload;                      /* current fixed-up telemetry */
    size_t payload_len;
    uint64_t sig_mtime, sig_size;       /* committed file signature */
} ws;

/* ---------- small helpers ---------- */

static double filetime_to_unix(const FILETIME *ft) {
    ULARGE_INTEGER v;
    v.LowPart = ft->dwLowDateTime; v.HighPart = ft->dwHighDateTime;
    return (double)(v.QuadPart - 116444736000000000ULL) / 1e7;
}

static double unix_now(void) {
    FILETIME ft; GetSystemTimeAsFileTime(&ft);
    return filetime_to_unix(&ft);
}

static void log_line(const char *text) {
    wchar_t base[1024];
    DWORD n = GetEnvironmentVariableW(L"LOCALAPPDATA", base, 1000);
    if (!n || n >= 1000) wcscpy(base, L".");
    wchar_t path[1100];
    swprintf(path, 1100, L"%ls\\MHDPS", base);
    CreateDirectoryW(path, NULL);
    swprintf(path, 1100, L"%ls\\MHDPS\\server.log", base);
    HANDLE h = CreateFileW(path, FILE_APPEND_DATA, FILE_SHARE_READ, NULL,
                           OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return;
    LARGE_INTEGER size; size.QuadPart = 0;
    GetFileSizeEx(h, &size);
    if (size.QuadPart > 1000000) {      /* keep the log bounded */
        CloseHandle(h);
        h = CreateFileW(path, GENERIC_WRITE, FILE_SHARE_READ, NULL,
                        CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
        if (h == INVALID_HANDLE_VALUE) return;
    }
    char line[1400];
    int len = snprintf(line, sizeof line, "%lld [MHDPS] %s\r\n", (long long)unix_now(), text);
    DWORD written = 0;
    if (len > 0) WriteFile(h, line, (DWORD)len, &written, NULL);
    CloseHandle(h);
}

static bool json_escape_append(char *out, size_t cap, size_t *len, const char *text) {
    for (const unsigned char *p = (const unsigned char *)text; *p; ++p) {
        char buf[8]; const char *emit = buf; size_t emit_len = 1;
        if (*p == '"' || *p == '\\') { buf[0] = '\\'; buf[1] = (char)*p; emit_len = 2; }
        else if (*p < 0x20) { snprintf(buf, sizeof buf, "\\u%04x", *p); emit_len = 6; }
        else buf[0] = (char)*p;
        if (*len + emit_len + 1 > cap) return false;
        memcpy(out + *len, emit, emit_len); *len += emit_len;
    }
    out[*len] = 0;
    return true;
}

/* Snapshot JSON mirroring relay.py 0.1.4: type/state/message[/path]/ageSeconds. */
static size_t build_status(char *out, size_t cap) {
    int state; double last_seen = 0; const char *path = NULL;
    EnterCriticalSection(&g.state_lock);
    state = g.state; last_seen = g.last_seen;
    if (state == STATE_LIVE) path = g.telemetry_utf8;
    LeaveCriticalSection(&g.state_lock);
    static const char *const messages[3] = {
        "Relay bereit - warte auf Mod-Daten",
        "Spieldaten empfangen",
        "Keine aktuellen Spieldaten - Spiel / MHDPS-Mod pruefen",
    };
    static const char *const names[3] = { "waiting", "live", "stale" };
    size_t len = 0;
    int n = snprintf(out, cap, "{\"type\":\"relay_status\",\"state\":\"%s\",\"message\":\"%s\"",
                     names[state], messages[state]);
    if (n < 0 || (size_t)n >= cap) return 0;
    len = (size_t)n;
    if (path) {
        n = snprintf(out + len, cap - len, ",\"path\":\"");
        if (n < 0 || (size_t)n >= cap - len) return 0;
        len += (size_t)n;
        size_t plen = strlen(path);           /* path is stored pre-escaped */
        if (len + plen + 1 >= cap) return 0;
        memcpy(out + len, path, plen);
        len += plen;
        out[len++] = '"';
    }
    if (last_seen > 0) {
        double age = unix_now() - last_seen;
        if (age < 0) age = 0;
        n = snprintf(out + len, cap - len, ",\"ageSeconds\":%.1f}", age);
    } else {
        n = snprintf(out + len, cap - len, ",\"ageSeconds\":null}");
    }
    if (n < 0 || (size_t)n >= cap - len) return 0;
    return len + (size_t)n;
}

static void set_state(int state, double last_seen) {
    EnterCriticalSection(&g.state_lock);
    g.state = state;
    g.last_seen = last_seen;
    LeaveCriticalSection(&g.state_lock);
}

/* ---------- SHA-1 + base64 (WebSocket handshake only) ---------- */

static void sha1(const unsigned char *data, size_t len, unsigned char out[20]) {
    uint32_t h[5] = { 0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0 };
    size_t padded = ((len + 8) / 64 + 1) * 64;
    unsigned char *block = calloc(padded, 1);
    if (!block) return;
    memcpy(block, data, len);
    block[len] = 0x80;
    uint64_t bits = (uint64_t)len * 8;
    for (int i = 0; i < 8; ++i) block[padded - 1 - i] = (unsigned char)(bits >> (8 * i));
    for (size_t off = 0; off < padded; off += 64) {
        uint32_t w[80];
        for (int i = 0; i < 16; ++i)
            w[i] = ((uint32_t)block[off + 4 * i] << 24) | ((uint32_t)block[off + 4 * i + 1] << 16) |
                   ((uint32_t)block[off + 4 * i + 2] << 8) | (uint32_t)block[off + 4 * i + 3];
        for (int i = 16; i < 80; ++i) {
            uint32_t x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
            w[i] = (x << 1) | (x >> 31);
        }
        uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
        for (int i = 0; i < 80; ++i) {
            uint32_t f; uint32_t k;
            if (i < 20) { f = (b & c) | ((~b) & d); k = 0x5A827999; }
            else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
            else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
            else { f = b ^ c ^ d; k = 0xCA62C1D6; }
            uint32_t t = ((a << 5) | (a >> 27)) + f + e + k + w[i];
            e = d; d = c; c = (b << 30) | (b >> 2); b = a; a = t;
        }
        h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e;
    }
    free(block);
    for (int i = 0; i < 5; ++i) {
        out[4 * i] = (unsigned char)(h[i] >> 24);
        out[4 * i + 1] = (unsigned char)(h[i] >> 16);
        out[4 * i + 2] = (unsigned char)(h[i] >> 8);
        out[4 * i + 3] = (unsigned char)h[i];
    }
}

static void base64_20(const unsigned char in[20], char out[32]) {
    static const char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    size_t o = 0;
    for (size_t i = 0; i < 20; i += 3) {
        uint32_t v = (uint32_t)in[i] << 16;
        if (i + 1 < 20) v |= (uint32_t)in[i + 1] << 8;
        if (i + 2 < 20) v |= in[i + 2];
        out[o++] = table[(v >> 18) & 63]; out[o++] = table[(v >> 12) & 63];
        out[o++] = (i + 1 < 20) ? table[(v >> 6) & 63] : '=';
        out[o++] = (i + 2 < 20) ? table[v & 63] : '=';
    }
    out[o] = 0;
}

/* ---------- sockets ---------- */

static bool socket_blocking(SOCKET s, bool blocking) {
    u_long mode = blocking ? 0 : 1;
    return ioctlsocket(s, FIONBIO, &mode) == 0;
}

static void socket_timeouts(SOCKET s, DWORD ms) {
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const char *)&ms, sizeof ms);
    setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, (const char *)&ms, sizeof ms);
}

static SOCKET listen_loopback(int port, const char *what) {
    SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (s == INVALID_SOCKET) return INVALID_SOCKET;
    int yes = 1;
    setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char *)&yes, sizeof yes);
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof addr);
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(0x7F000001);   /* loopback only */
    addr.sin_port = htons((unsigned short)port);
    if (bind(s, (struct sockaddr *)&addr, sizeof addr) == 0 && listen(s, 16) == 0)
        return s;
    closesocket(s);
    char text[160];
    snprintf(text, sizeof text, "%s: port %d busy (WSA %d); retrying every %d ms",
             what, port, WSAGetLastError(), BIND_RETRY_MS);
    log_line(text);
    return INVALID_SOCKET;
}

/* Send exactly len bytes; gives up after SEND_BUDGET_MS of blocking. */
static bool send_all(SOCKET s, const void *data, size_t len) {
    const char *p = data;
    ULARGE_INTEGER start; GetSystemTimeAsFileTime((FILETIME *)&start);
    while (len) {
        int sent = send(s, p, (int)(len > 65536 ? 65536 : len), 0);
        if (sent > 0) { p += sent; len -= (size_t)sent; continue; }
        int err = WSAGetLastError();
        if (sent == 0 || (err != WSAEWOULDBLOCK && err != WSAEINPROGRESS)) return false;
        fd_set set; FD_ZERO(&set); FD_SET(s, &set);
        struct timeval tv = { 0, 100000 };
        if (select(0, NULL, &set, NULL, &tv) <= 0) {
            ULARGE_INTEGER now; GetSystemTimeAsFileTime((FILETIME *)&now);
            if (now.QuadPart - start.QuadPart > (uint64_t)SEND_BUDGET_MS * 10000)
                return false;
        }
    }
    return true;
}

/* ---------- telemetry ---------- */

static bool telemetry_stat(uint64_t *mtime, uint64_t *size, double *mtime_unix) {
    WIN32_FILE_ATTRIBUTE_DATA info;
    if (!GetFileAttributesExW(g.telemetry, GetFileExInfoStandard, &info)) return false;
    ULARGE_INTEGER m, z;
    m.LowPart = info.ftLastWriteTime.dwLowDateTime; m.HighPart = info.ftLastWriteTime.dwHighDateTime;
    z.LowPart = info.nFileSizeLow; z.HighPart = info.nFileSizeHigh;
    *mtime = m.QuadPart; *size = z.QuadPart;
    *mtime_unix = filetime_to_unix(&info.ftLastWriteTime);
    return true;
}

/* Read, cap, sanity-check and fix up the telemetry file (parity with relay.py). */
static bool telemetry_read(char **data, size_t *len) {
    HANDLE h = CreateFileW(g.telemetry, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
                           NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return false;
    char *buffer = malloc(TELEMETRY_HARD_MAX + 1);
    if (!buffer) { CloseHandle(h); return false; }
    DWORD total = 0;
    bool ok = true;
    while (total < TELEMETRY_HARD_MAX) {
        DWORD read_bytes = 0;
        if (!ReadFile(h, buffer + total, TELEMETRY_HARD_MAX - total, &read_bytes, NULL)) { ok = false; break; }
        if (!read_bytes) break;
        total += read_bytes;
    }
    CloseHandle(h);
    if (!ok || total > TELEMETRY_MAX || total < 2) { free(buffer); return false; }
    char *start = buffer;                        /* strip UTF-8 BOM */
    if (total >= 3 && (unsigned char)start[0] == 0xEF && (unsigned char)start[1] == 0xBB &&
        (unsigned char)start[2] == 0xBF) { start += 3; total -= 3; }
    while (total && (start[total - 1] == '\n' || start[total - 1] == '\r' ||
                     start[total - 1] == ' ' || start[total - 1] == '\t')) --total;
    /* torn writes surface as truncated documents; wait for the next dump */
    if (total < 2 || start[0] != '{' || start[total - 1] != '}') { free(buffer); return false; }
    start[total] = 0;
    /* sanity gate only (whitespace-tolerant); the dashboard re-validates.
     * Python parity accepted game = wilds | rise | world. */
    if (!strstr(start, "\"wilds\"") && !strstr(start, "\"rise\"") && !strstr(start, "\"world\"")) {
        free(buffer); return false;
    }
    if (!strstr(start, "\"quest\"") || !strstr(start, "\"players\"")) { free(buffer); return false; }
    /* Lua serialises an empty player table as {}; the dashboard requires []. */
    for (char *p = strstr(start, "\"players\""); p; p = strstr(p + 1, "\"players\"")) {
        char *colon = strchr(p, ':');
        if (!colon) continue;
        char *q = colon + 1;
        while (*q == ' ' || *q == '\t' || *q == '\r' || *q == '\n') ++q;
        if (q[0] == '{' && q[1] == '}') { q[0] = '['; q[1] = ']'; }
    }
    *data = start; *len = total;
    return true;
}

/* ---------- websocket server ---------- */

static void ws_drop(size_t index) {
    closesocket(ws.clients[index].sock);
    ws.clients[index] = ws.clients[ws.count - 1];
    --ws.count;
}

static bool ws_send_frame(SOCKET s, unsigned char opcode, const void *payload, size_t len) {
    unsigned char header[10];
    size_t header_len;
    if (len <= 125) {
        header[0] = (unsigned char)(0x80 | opcode); header[1] = (unsigned char)len; header_len = 2;
    } else if (len <= 0xFFFF) {
        header[0] = (unsigned char)(0x80 | opcode); header[1] = 126;
        header[2] = (unsigned char)(len >> 8); header[3] = (unsigned char)len; header_len = 4;
    } else {
        header[0] = (unsigned char)(0x80 | opcode); header[1] = 127;
        for (int i = 0; i < 8; ++i) header[9 - i] = (unsigned char)(len >> (8 * i));
        header_len = 10;
    }
    if (!send_all(s, header, header_len)) return false;
    return len ? send_all(s, payload, len) : true;
}

static void ws_broadcast(const void *payload, size_t len) {
    for (size_t i = ws.count; i > 0; --i)
        if (!ws_send_frame(ws.clients[i - 1].sock, 0x1, payload, len))
            ws_drop(i - 1);
}

static bool header_value(const char *request, const char *name, char *out, size_t cap) {
    size_t name_len = strlen(name);
    const char *p = request;
    while ((p = strstr(p, "\r\n")) != NULL) {
        p += 2;
        size_t i = 0;
        while (p[i] == ' ' || p[i] == '\t') ++i;
        if (_strnicmp(p + i, name, name_len) != 0 || p[i + name_len] != ':') continue;
        i += name_len + 1;
        while (p[i] == ' ' || p[i] == '\t') ++i;
        size_t j = i;
        while (p[j] && p[j] != '\r' && p[j] != '\n') ++j;
        while (j > i && (p[j - 1] == ' ' || p[j - 1] == '\t')) --j;
        if (j - i >= cap) return false;
        memcpy(out, p + i, j - i);
        out[j - i] = 0;
        return true;
    }
    return false;
}

static bool origin_allowed(const char *origin) {
    if (!origin || !*origin) return false;       /* parity: absent origin is rejected */
    char extra[2][64];
    for (int i = 0; i < 2; ++i) {
        snprintf(extra[i], sizeof extra[i], "http://%s:%d", i ? "127.0.0.1" : "localhost", g.http_port);
        if (strcmp(origin, extra[i]) == 0) return true;
    }
    for (size_t i = 0; i < sizeof ORIGINS / sizeof *ORIGINS; ++i)
        if (strcmp(origin, ORIGINS[i]) == 0) return true;
    return false;
}

/* Blocking handshake with a small timeout, then the socket goes non-blocking. */
static SOCKET ws_handshake(SOCKET s, bool *send_payload) {
    *send_payload = false;
    socket_timeouts(s, IO_TIMEOUT_MS);
    char request[HTTP_REQUEST_MAX + 1];
    size_t got = 0;
    while (got < HTTP_REQUEST_MAX) {
        int n = recv(s, request + got, (int)(HTTP_REQUEST_MAX - got), 0);
        if (n <= 0) { closesocket(s); return INVALID_SOCKET; }
        got += (size_t)n;
        request[got] = 0;
        if (strstr(request, "\r\n\r\n")) break;
    }
    if (got < 16 || _strnicmp(request, "GET ", 4) != 0 || !strstr(request, "\r\n\r\n")) {
        closesocket(s); return INVALID_SOCKET;
    }
    char key[128] = "", origin[256] = "", version[16] = "", upgrade[32] = "";
    if (!header_value(request, "Sec-WebSocket-Key", key, sizeof key)) {
        closesocket(s); return INVALID_SOCKET;
    }
    header_value(request, "Origin", origin, sizeof origin);
    header_value(request, "Sec-WebSocket-Version", version, sizeof version);
    header_value(request, "Upgrade", upgrade, sizeof upgrade);
    if (strcmp(version, "13") != 0 || _strnicmp(upgrade, "websocket", 9) != 0) {
        static const char bad[] = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        send_all(s, bad, sizeof bad - 1); closesocket(s); return INVALID_SOCKET;
    }
    if (!origin_allowed(origin)) {
        static const char denied[] = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        send_all(s, denied, sizeof denied - 1); closesocket(s); return INVALID_SOCKET;
    }
    char accept_input[256], accept[32];
    unsigned char digest[20];
    snprintf(accept_input, sizeof accept_input, "%s%s", key, WS_GUID);
    sha1((const unsigned char *)accept_input, strlen(accept_input), digest);
    base64_20(digest, accept);
    char response[256];
    int n = snprintf(response, sizeof response,
                     "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
                     "Connection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n", accept);
    if (n <= 0 || !send_all(s, response, (size_t)n)) { closesocket(s); return INVALID_SOCKET; }
    socket_blocking(s, false);
    /* parity: clients that connect while data is fresh replay the payload */
    double age = g.last_seen > 0 ? unix_now() - g.last_seen : 1e9;
    if (ws.payload && ws.payload_len && age <= STALE_AFTER) *send_payload = true;
    return s;
}

/* Parse complete frames from the leftover buffer; content is discarded but
 * ping gets a pong, close gets echoed, and oversize frames drop the client. */
static void ws_consume(client_t *c) {
    unsigned char *b = c->leftover;
    size_t len = c->leftover_len;
    while (len >= 2) {
        unsigned char opcode = b[0] & 0x0F;
        bool masked = (b[1] & 0x80) != 0;
        uint64_t plen = b[1] & 0x7F;
        size_t off = 2;
        if (plen == 126) {
            if (len < 4) break;
            plen = ((uint64_t)b[2] << 8) | b[3]; off = 4;
        } else if (plen == 127) {
            if (len < 10) break;
            plen = 0;
            for (int i = 0; i < 8; ++i) plen = (plen << 8) | b[2 + i];
            off = 10;
        }
        unsigned char mask[4] = { 0 };
        if (masked) {
            if (len < off + 4) break;
            memcpy(mask, b + off, 4); off += 4;
        }
        if (plen > CLIENT_RECV_MAX || len < off + (size_t)plen) break;
        unsigned char *payload = b + off;
        for (uint64_t i = 0; masked && i < plen; ++i) payload[i] ^= mask[i & 3];
        if (opcode == 0x9) {                              /* ping -> pong */
            ws_send_frame(c->sock, 0xA, payload, (size_t)plen);
        } else if (opcode == 0x8) {                       /* close -> echo, drop */
            ws_send_frame(c->sock, 0x8, payload, (size_t)plen);
            c->leftover_len = 0;
            ws_drop((size_t)(c - ws.clients));
            return;
        }
        size_t consumed = off + (size_t)plen;
        memmove(b, b + consumed, len - consumed);
        len -= consumed;
    }
    c->leftover_len = len;
}

static DWORD WINAPI ws_thread(void *unused) {
    (void)unused;
    SOCKET listener = INVALID_SOCKET;
    while (!g.stopping) {
        listener = listen_loopback(g.ws_port, "WebSocket relay");
        if (listener != INVALID_SOCKET) break;
        Sleep(BIND_RETRY_MS);
    }
    char log[200];
    snprintf(log, sizeof log, "WebSocket relay listening on 127.0.0.1:%d", g.ws_port);
    log_line(log);
    double last_heartbeat = 0, last_error_log = 0;
    while (!g.stopping) {
        char status[STATUS_MAX];
        size_t status_len = build_status(status, sizeof status);
        fd_set read_set;
        FD_ZERO(&read_set);
        FD_SET(listener, &read_set);
        for (size_t i = 0; i < ws.count; ++i) FD_SET(ws.clients[i].sock, &read_set);
        struct timeval tv = { 0, POLL_MS * 1000 };
        int ready = select(0, &read_set, NULL, NULL, &tv);
        if (ready > 0 && FD_ISSET(listener, &read_set)) {
            SOCKET s = accept(listener, NULL, NULL);
            if (s != INVALID_SOCKET) {
                bool send_payload = false;
                SOCKET client = ws_handshake(s, &send_payload);
                if (client != INVALID_SOCKET) {
                    if (ws.count < CLIENT_MAX && status_len) {
                        size_t slot = ws.count;
                        memset(&ws.clients[slot], 0, sizeof ws.clients[slot]);
                        ws.clients[slot].sock = client;
                        /* parity: snapshot first, then fresh data if any */
                        if (ws_send_frame(client, 0x1, status, status_len)) {
                            ++ws.count;
                            if (send_payload)
                                ws_send_frame(client, 0x1, ws.payload, ws.payload_len);
                        } else {
                            closesocket(client);
                        }
                    } else {
                        closesocket(client);
                    }
                }
            }
            --ready;
        }
        for (size_t i = ws.count; i > 0 && ready > 0; --i) {
            client_t *c = &ws.clients[i - 1];
            if (!FD_ISSET(c->sock, &read_set)) continue;
            --ready;
            int n = recv(c->sock, (char *)c->leftover + c->leftover_len,
                         (int)(CLIENT_RECV_MAX - c->leftover_len), 0);
            if (n <= 0) { ws_drop(i - 1); continue; }
            c->leftover_len += (size_t)n;
            ws_consume(c);                     /* may drop the client itself */
        }
        /* Telemetry poll mirroring relay.py: mtime+size signature and a 5 s
         * freshness window; the signature only commits after a clean read. */
        uint64_t mtime = 0, size = 0;
        double mtime_unix = 0;
        bool exists = telemetry_stat(&mtime, &size, &mtime_unix);
        double now = unix_now();
        if (exists && (mtime != ws.sig_mtime || size != ws.sig_size) &&
            now - mtime_unix <= STALE_AFTER) {
            char *data = NULL;
            size_t data_len = 0;
            if (telemetry_read(&data, &data_len)) {
                free(ws.payload);
                ws.payload = data; ws.payload_len = data_len;
                ws.sig_mtime = mtime; ws.sig_size = size;
                set_state(STATE_LIVE, mtime_unix);
                status_len = build_status(status, sizeof status);
                ws_broadcast(status, status_len);
                ws_broadcast(ws.payload, ws.payload_len);
            } else if (now - last_error_log > 30) {
                log_line("Telemetry rejected (torn write, invalid or oversized)");
                last_error_log = now;
            }
        }
        if (g.last_seen == 0 || now - g.last_seen > STALE_AFTER) {
            free(ws.payload);
            ws.payload = NULL; ws.payload_len = 0;
            set_state(exists ? STATE_STALE : STATE_WAITING, g.last_seen);
        }
        if (last_heartbeat == 0 || now - last_heartbeat >= 1.0) {
            last_heartbeat = now;
            status_len = build_status(status, sizeof status);
            ws_broadcast(status, status_len);
        }
    }
    if (listener != INVALID_SOCKET) closesocket(listener);
    for (size_t i = 0; i < ws.count; ++i) closesocket(ws.clients[i].sock);
    free(ws.payload);
    return 0;
}

/* ---------- HTTP server ---------- */

static const char *mime_for(const char *path) {
    static const struct { const char *ext, *type; } table[] = {
        { ".html", "text/html; charset=utf-8" }, { ".htm", "text/html; charset=utf-8" },
        { ".css", "text/css; charset=utf-8" }, { ".js", "text/javascript; charset=utf-8" },
        { ".mjs", "text/javascript; charset=utf-8" }, { ".json", "application/json" },
        { ".svg", "image/svg+xml" }, { ".png", "image/png" }, { ".jpg", "image/jpeg" },
        { ".jpeg", "image/jpeg" }, { ".webp", "image/webp" }, { ".ico", "image/x-icon" },
        { ".txt", "text/plain; charset=utf-8" }, { ".woff2", "font/woff2" },
    };
    const char *dot = strrchr(path, '.');
    if (dot)
        for (size_t i = 0; i < sizeof table / sizeof *table; ++i)
            if (_stricmp(dot, table[i].ext) == 0) return table[i].type;
    return "application/octet-stream";
}

static bool percent_decode(const char *in, char *out, size_t cap) {
    size_t o = 0;
    for (size_t i = 0; in[i]; ++i) {
        if (o + 1 >= cap) return false;
        if (in[i] == '%' && isxdigit((unsigned char)in[i + 1]) && isxdigit((unsigned char)in[i + 2])) {
            char hex[3] = { in[i + 1], in[i + 2], 0 };
            out[o++] = (char)strtol(hex, NULL, 16);
            i += 2;
        } else if (in[i] == '+') {
            out[o++] = ' ';
        } else {
            out[o++] = in[i];
        }
    }
    out[o] = 0;
    return true;
}

static void http_respond(SOCKET s, const char *status, const char *type,
                         const void *body, size_t body_len, bool head_only) {
    char header[512];
    int n = snprintf(header, sizeof header,
                     "HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %llu\r\n"
                     "Cache-Control: no-cache\r\nConnection: close\r\n\r\n",
                     status, type, (unsigned long long)body_len);
    if (n > 0 && send_all(s, header, (size_t)n) && !head_only && body_len)
        send_all(s, body, body_len);
}

static void http_serve(SOCKET s, char *request) {
    char method[8] = { 0 }, raw_path[2048] = { 0 };
    if (sscanf(request, "%7s %2047s", method, raw_path) != 2) {
        http_respond(s, "400 Bad Request", "text/plain", "bad request", 11, false);
        return;
    }
    bool head = strcmp(method, "HEAD") == 0, get = strcmp(method, "GET") == 0;
    if (!get && !head) {
        http_respond(s, "405 Method Not Allowed", "text/plain", "method", 6, false);
        return;
    }
    char *query = strchr(raw_path, '?');
    if (query) *query = 0;
    char path[2048];
    if (!percent_decode(raw_path, path, sizeof path) ||
        strstr(path, "..") || strchr(path, '\\')) {
        http_respond(s, "400 Bad Request", "text/plain", "bad request", 11, false);
        return;
    }
    if (!strcmp(path, "/health")) {
        char status[STATUS_MAX];
        size_t len = build_status(status, sizeof status);
        if (len) http_respond(s, "200 OK", "application/json", status, len, head);
        return;
    }
    if (!strcmp(path, "/")) strcpy(path, "/index.html");
    wchar_t wide_path[2048];
    int wide_len = MultiByteToWideChar(CP_UTF8, 0, path, -1, wide_path, (int)(sizeof wide_path / 2));
    if (wide_len <= 0) {
        http_respond(s, "400 Bad Request", "text/plain", "bad request", 11, false);
        return;
    }
    for (int i = 0; wide_path[i]; ++i)          /* URL separators -> Windows */
        if (wide_path[i] == L'/') wide_path[i] = L'\\';
    wchar_t full[2048 + 128];
    swprintf(full, sizeof full / sizeof *full, L"%ls%ls", g.web_root, wide_path);
    DWORD attr = GetFileAttributesW(full);
    if (attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY)) {
        size_t n = wcslen(full);
        if (n + 12 < sizeof full / sizeof *full) {
            wcscpy(full + n, L"\\index.html");
            attr = GetFileAttributesW(full);
        }
    }
    if (attr == INVALID_FILE_ATTRIBUTES || (attr & FILE_ATTRIBUTE_DIRECTORY)) {
        static const char not_found[] = "File not found";
        http_respond(s, "404 Not Found", "text/plain", not_found, sizeof not_found - 1, head);
        return;
    }
    HANDLE h = CreateFileW(full, GENERIC_READ, FILE_SHARE_READ, NULL,
                           OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) {
        static const char not_found[] = "File not found";
        http_respond(s, "404 Not Found", "text/plain", not_found, sizeof not_found - 1, head);
        return;
    }
    LARGE_INTEGER size; size.QuadPart = 0;
    GetFileSizeEx(h, &size);
    if (size.QuadPart < 0 || size.QuadPart > 64 * 1024 * 1024) {
        CloseHandle(h);
        http_respond(s, "403 Forbidden", "text/plain", "forbidden", 9, head);
        return;
    }
    char ascii_path[2048 + 128];
    WideCharToMultiByte(CP_UTF8, 0, full, -1, ascii_path, sizeof ascii_path, NULL, NULL);
    char *body = malloc(size.QuadPart ? (size_t)size.QuadPart : 1);
    DWORD read_bytes = 0;
    bool ok = body && ReadFile(h, body, (DWORD)size.QuadPart, &read_bytes, NULL) &&
              read_bytes == (DWORD)size.QuadPart;
    CloseHandle(h);
    if (!ok) {
        free(body);
        http_respond(s, "500 Internal Server Error", "text/plain", "error", 5, head);
        return;
    }
    http_respond(s, "200 OK", mime_for(ascii_path), body, read_bytes, head);
    free(body);
}

static DWORD WINAPI http_thread(void *unused) {
    (void)unused;
    SOCKET listener = INVALID_SOCKET;
    while (!g.stopping) {
        listener = listen_loopback(g.http_port, "Dashboard HTTP");
        if (listener != INVALID_SOCKET) break;
        Sleep(BIND_RETRY_MS);
    }
    char log[200];
    snprintf(log, sizeof log, "Dashboard listening on http://127.0.0.1:%d", g.http_port);
    log_line(log);
    while (!g.stopping) {
        SOCKET s = accept(listener, NULL, NULL);
        if (s == INVALID_SOCKET) { Sleep(50); continue; }
        socket_timeouts(s, IO_TIMEOUT_MS);
        char request[HTTP_REQUEST_MAX + 1];
        size_t got = 0;
        while (got < HTTP_REQUEST_MAX) {
            int n = recv(s, request + got, (int)(HTTP_REQUEST_MAX - got), 0);
            if (n <= 0) break;
            got += (size_t)n;
            request[got] = 0;
            if (strstr(request, "\r\n\r\n")) break;
        }
        if (got) { request[got] = 0; http_serve(s, request); }
        closesocket(s);
    }
    if (listener != INVALID_SOCKET) closesocket(listener);
    return 0;
}

/* ---------- plugin entry ---------- */

static int env_port(const wchar_t *name, int fallback) {
    wchar_t value[16];
    DWORD n = GetEnvironmentVariableW(name, value, 15);
    if (!n || n >= 15) return fallback;
    wchar_t *end = NULL;
    long port = wcstol(value, &end, 10);
    if (!end || *end || port < 1 || port > 65535) return fallback;
    return (int)port;
}

__declspec(dllexport) bool reframework_plugin_initialize(const void *unused) {
    (void)unused;
    if (InterlockedExchange(&g.started, 1)) return true;
    HMODULE module = NULL;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
            GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            (LPCWSTR)&reframework_plugin_initialize, &module)) return false;
    wchar_t path[2048 + 128];
    DWORD length = GetModuleFileNameW(module, path, (DWORD)(sizeof path / sizeof *path));
    if (!length) return false;
    wcscpy(g.root, path);
    for (int i = 0; i < 3; ++i) {         /* ...\reframework\plugins\ -> game root */
        wchar_t *slash = wcsrchr(g.root, L'\\');
        if (!slash) return false;
        *slash = 0;
    }
    swprintf(g.telemetry, sizeof g.telemetry / sizeof *g.telemetry,
             L"%ls\\reframework\\data\\dps_live.json", g.root);
    swprintf(g.web_root, sizeof g.web_root / sizeof *g.web_root,
             L"%ls\\reframework\\mhdps\\web", g.root);
    char utf8[sizeof g.telemetry_utf8 / 3];
    int n = WideCharToMultiByte(CP_UTF8, 0, g.telemetry, -1, utf8, sizeof utf8, NULL, NULL);
    size_t escaped = 0;
    if (n > 0) json_escape_append(g.telemetry_utf8, sizeof g.telemetry_utf8, &escaped, utf8);
    else g.telemetry_utf8[0] = 0;
    g.http_port = env_port(L"MHDPS_HTTP_PORT", HTTP_PORT_DEFAULT);
    g.ws_port = env_port(L"MHDPS_WS_PORT", WS_PORT_DEFAULT);
    InitializeCriticalSection(&g.state_lock);
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) { log_line("WSAStartup failed"); return false; }
    g.stopping = 0;
    char log[2100];
    snprintf(log, sizeof log, "MHDPS native relay 0.1.5 starting; HTTP %d, WS %d; root: %ls",
             g.http_port, g.ws_port, g.root);
    log_line(log);
    HANDLE http = CreateThread(NULL, 0, http_thread, NULL, 0, NULL);
    HANDLE relay = CreateThread(NULL, 0, ws_thread, NULL, 0, NULL);
    if (!http || !relay) { log_line("thread creation failed"); return false; }
    CloseHandle(http);
    CloseHandle(relay);
    return true;
}

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID reserved) {
    (void)instance; (void)reserved;
    if (reason == DLL_PROCESS_DETACH) g.stopping = 1;
    return TRUE;
}
