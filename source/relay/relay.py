"""MHDPS local companion: game JSON -> loopback WebSocket, no cloud upload."""
import argparse
import asyncio
import json
import logging
import math
import os
import re
import sys
import threading
import time
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from websockets.asyncio.server import serve

LOG = logging.getLogger('mhdps')
BASE = Path(sys.executable if getattr(sys, 'frozen', False) else __file__).resolve().parent
WEB = BASE / 'web' if getattr(sys, 'frozen', False) else BASE.parent / 'web'
ORIGINS = ['https://mhdps.sengakujiworks.com', 'http://localhost:8080', 'http://127.0.0.1:8080',
           'http://localhost:8085', 'http://127.0.0.1:8085']


def discover_paths(explicit=None):
    if explicit:
        p = Path(explicit).expanduser()
        return [p if p.suffix.lower() == '.json' else p / 'reframework/data/dps_live.json']
    roots = [Path(r'G:\SteamLibrary\steamapps\common\MonsterHunterWilds')]
    steam = Path(os.environ.get('PROGRAMFILES(X86)', r'C:\Program Files (x86)')) / 'Steam'
    libraries = [steam]
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Valve\Steam') as key:
            libraries.append(Path(winreg.QueryValueEx(key, 'SteamPath')[0]))
    except (ImportError, OSError):
        pass
    for library in list(libraries):
        try:
            text = (library / 'steamapps/libraryfolders.vdf').read_text(encoding='utf-8')
            libraries += [Path(p.replace('\\\\', '\\')) for p in re.findall(r'"path"\s+"([^"]+)"', text)]
        except OSError:
            pass
    roots += [p / 'steamapps/common/MonsterHunterWilds' for p in libraries]
    return list(dict.fromkeys([p / 'reframework/data/dps_live.json' for p in roots] + [BASE / 'dps_live.json']))


def parse_packet(content):
    data = json.loads(content)
    if isinstance(data, str):  # tolerate old double-encoded exporters
        data = json.loads(data)
    if not isinstance(data, dict) or data.get('game') not in ('wilds', 'rise', 'world'):
        raise ValueError('Missing supported game')
    quest = data.get('quest')
    if not isinstance(quest, dict) or quest.get('status') not in ('idle', 'in_progress', 'completed', 'ended', 'failed', 'aborted'):
        raise ValueError('Invalid quest status')
    # Lua encodes an empty table as {}, not necessarily [].
    if data.get('players') is None or data.get('players') == {}:
        data['players'] = []
    if not isinstance(data.get('players'), list) or len(data['players']) > 64:
        raise ValueError('Invalid players')
    def finite(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0
    if not finite(quest.get('timeSeconds')):
        raise ValueError('Invalid quest time')
    for p in data['players']:
        if not isinstance(p, dict) or not isinstance(p.get('name'), str):
            raise ValueError('Invalid hunter')
        for key in ('damage', 'dps', 'damageShare'):
            if not finite(p.get(key)):
                raise ValueError('Invalid ' + key)
    return data


class Relay:
    def __init__(self, paths, stale_after=5):
        self.paths = paths
        self.stale_after = stale_after
        self.clients = set()
        self.payload = None
        self.signature = None
        self.last_seen = 0
        self.status = {'type': 'relay_status', 'state': 'waiting', 'message': 'Relay bereit - warte auf Mod-Daten'}
        self.last_error = None

    def snapshot(self):
        return dict(self.status, ageSeconds=round(time.time()-self.last_seen, 1) if self.last_seen else None)

    async def register(self, ws):
        self.clients.add(ws)
        try:
            await ws.send(json.dumps(self.snapshot()))
            if self.payload and time.time()-self.last_seen <= self.stale_after:
                await ws.send(json.dumps(self.payload, allow_nan=False))
            await ws.wait_closed()
        finally:
            self.clients.discard(ws)

    async def broadcast(self, data):
        message = json.dumps(data, allow_nan=False)
        async def send(ws):
            try:
                await asyncio.wait_for(ws.send(message), timeout=2)
            except Exception:
                self.clients.discard(ws)
        await asyncio.gather(*(send(ws) for ws in tuple(self.clients)))

    async def poll(self):
        candidates = []
        for p in self.paths:
            try:
                stat = p.stat()
                candidates.append((stat.st_mtime_ns, p, stat))
            except OSError:
                pass
        if candidates:
            _, path, stat = max(candidates, key=lambda x: x[0])
            signature = (str(path), stat.st_mtime_ns, stat.st_size)
            if signature != self.signature and time.time()-stat.st_mtime <= self.stale_after:
                try:
                    if stat.st_size > 2_000_000:
                        raise ValueError('Telemetry exceeds 2 MB')
                    data = parse_packet(path.read_text(encoding='utf-8-sig'))
                    # Commit mtime only after parsing, so partially written files retry.
                    self.signature, self.last_seen, self.payload = signature, stat.st_mtime, data
                    self.status = {'type':'relay_status', 'state':'live', 'message':'Spieldaten empfangen', 'path':str(path)}
                    self.last_error = None
                    await self.broadcast(self.snapshot())
                    await self.broadcast(data)
                except (OSError, ValueError) as error:
                    if str(error) != self.last_error:
                        LOG.warning('Cannot read %s: %s', path, error)
                        self.last_error = str(error)
        if not self.last_seen or time.time()-self.last_seen > self.stale_after:
            self.payload = None
            self.status = {'type':'relay_status', 'state':'stale' if candidates else 'waiting',
                           'message':'Keine aktuellen Spieldaten - Spiel / MHDPS-Mod pruefen'}

    async def watch(self):
        last_status = 0
        while True:
            await self.poll()
            if time.monotonic()-last_status >= 1:
                await self.broadcast(self.snapshot())
                last_status = time.monotonic()
            await asyncio.sleep(.15)


def http_server(relay, port):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(WEB), **kwargs)
        def do_GET(self):
            if self.path == '/health':
                body = json.dumps(relay.snapshot()).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                super().do_GET()
        def list_directory(self, path):
            self.send_error(403)
        def log_message(self, *args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game-dir', default=os.environ.get('MHDPS_GAME_DIR'))
    parser.add_argument('--file', help='Explicit telemetry JSON path (overrides discovery)')
    parser.add_argument('--ws-port', type=int, default=9999)
    parser.add_argument('--http-port', type=int, default=8080)
    parser.add_argument('--autostart', action='store_true')
    parser.add_argument('--game-pid', type=int)
    args = parser.parse_args()
    from startup import GameSession, SingleInstance, open_dashboard
    instance = SingleInstance() if os.name == 'nt' else None
    if instance and instance.existing:
        instance.close()
        return
    game = None
    try:
        if args.game_pid:
            game = GameSession(args.game_pid)
        await run_relay(args, game, open_dashboard)
    finally:
        if game:
            game.close()
        if instance:
            instance.close()


async def run_relay(args, game=None, open_dashboard=None):
    relay = Relay(discover_paths(args.file or args.game_dir))
    origins = list(dict.fromkeys(ORIGINS + [f'http://localhost:{args.http_port}', f'http://127.0.0.1:{args.http_port}']))
    LOG.info('Looking for telemetry: %s', ', '.join(map(str, relay.paths)))
    async with serve(relay.register, '127.0.0.1', args.ws_port, origins=origins, max_size=4096):
        server = http_server(relay, args.http_port)
        LOG.info('Ready: http://localhost:%s | https://mhdps.sengakujiworks.com', args.http_port)
        if args.autostart and open_dashboard:
            threading.Thread(target=open_dashboard, daemon=True).start()
        try:
            if game:
                watch = asyncio.create_task(relay.watch())
                lifetime = asyncio.create_task(game.wait())
                try:
                    done, _ = await asyncio.wait([watch, lifetime], return_when=asyncio.FIRST_COMPLETED)
                    for task in done:
                        task.result()
                finally:
                    watch.cancel(); lifetime.cancel()
                    await asyncio.gather(watch, lifetime, return_exceptions=True)
            else:
                await relay.watch()
        finally:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    log_dir = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'MHDPS'
    log_dir.mkdir(parents=True, exist_ok=True)
    from logging.handlers import RotatingFileHandler
    logging.basicConfig(level=logging.INFO, format='%(asctime)s [MHDPS] %(message)s',
                        handlers=[RotatingFileHandler(log_dir/'companion.log', maxBytes=1_000_000, backupCount=2, encoding='utf-8')])
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except OSError as error:
        LOG.error('Start failed (another relay already running?): %s', error)
        if os.name == 'nt':
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, 'MHDPS konnte nicht starten. Bitte einen eventuell noch laufenden alten Begleiter beenden. Details: '+str(log_dir/'companion.log'), 'MHDPS', 0x10)
        sys.exit(1)
