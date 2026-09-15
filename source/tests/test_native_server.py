"""Native relay smoke test: the REFramework plugin DLL serves the dashboard
and the telemetry WebSocket in-process, with no external executable.
Uses isolated ports (MHDPS_HTTP_PORT / MHDPS_WS_PORT) and a temp game root."""
import ctypes
import json
import os
import shutil
import socket
import tempfile
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'build' / 'MHDPS-Bootstrap.dll'


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def telemetry(status='in_progress', seconds=3, players=None):
    return json.dumps({'schemaVersion': 1, 'source': 'mhdps-wilds', 'game': 'wilds',
                       'quest': {'id': 't:1', 'dpsBasis': 'quest-time', 'status': status,
                                 'timeSeconds': seconds},
                       'players': [] if players is None else players,
                       'diagnostics': {'version': '0.1.5'}})


class NativeServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.name != 'nt':
            raise unittest.SkipTest('Windows DLL required')
        if not BUILD.is_file():
            raise unittest.SkipTest('Run build.ps1 to produce build/MHDPS-Bootstrap.dll first')
        cls.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        root = Path(cls.tmp.name)
        (root / 'reframework/plugins').mkdir(parents=True)
        (root / 'reframework/data').mkdir(parents=True)
        web = root / 'reframework/mhdps/web/css'
        web.mkdir(parents=True)
        shutil.copy2(BUILD, root / 'reframework/plugins/MHDPS-Relay.dll')
        (root / 'reframework/mhdps/web/index.html').write_text('<html>mhdps-test</html>', encoding='utf-8')
        (web / 'style.css').write_text('body{}', encoding='utf-8')
        cls.http_port, cls.ws_port = free_port(), free_port()
        os.environ['MHDPS_HTTP_PORT'] = str(cls.http_port)
        os.environ['MHDPS_WS_PORT'] = str(cls.ws_port)
        cls.dll = ctypes.CDLL(str(root / 'reframework/plugins/MHDPS-Relay.dll'))
        cls.dll.reframework_plugin_initialize.argtypes = [ctypes.c_void_p]
        cls.dll.reframework_plugin_initialize.restype = ctypes.c_bool
        if not cls.dll.reframework_plugin_initialize(None):
            raise AssertionError('plugin init failed')
        if not cls.dll.reframework_plugin_initialize(None):
            raise AssertionError('plugin init is not idempotent')
        cls.data = root / 'reframework/data/dps_live.json'
        deadline = time.time() + 10
        while time.time() < deadline:
            try:
                urlopen(f'http://127.0.0.1:{cls.http_port}/health', timeout=.5)
                break
            except OSError:
                time.sleep(.1)
        else:
            raise AssertionError('native server did not come up')

    @classmethod
    def tearDownClass(cls):
        os.environ.pop('MHDPS_HTTP_PORT', None)
        os.environ.pop('MHDPS_WS_PORT', None)
        cls.tmp.cleanup()

    def health(self):
        return json.load(urlopen(f'http://127.0.0.1:{self.http_port}/health', timeout=2))

    def get(self, path):
        with urlopen(f'http://127.0.0.1:{self.http_port}{path}', timeout=2) as r:
            return r.status, r.headers.get('Content-Type', ''), r.read()

    def connect_ws(self, origin=None):
        from websockets.sync.client import connect
        url = f'ws://127.0.0.1:{self.ws_port}'
        return connect(url, origin=origin, open_timeout=5) if origin else connect(url, open_timeout=5)

    def test_health_starts_waiting(self):
        self.assertEqual(self.health().get('type'), 'relay_status')

    def test_static_dashboard_and_missing_files(self):
        status, ctype, body = self.get('/')
        self.assertEqual(status, 200)
        self.assertIn('text/html', ctype)
        self.assertIn(b'mhdps-test', body)
        status, ctype, body = self.get('/css/style.css')
        self.assertEqual((status, body), (200, b'body{}'))
        self.assertIn('text/css', ctype)
        with self.assertRaises(HTTPError) as ctx:
            self.get('/missing.js')
        self.assertEqual(ctx.exception.code, 404)

    def test_path_traversal_rejected(self):
        with socket.create_connection(('127.0.0.1', self.http_port), timeout=2) as s:
            s.sendall(b'GET /../server.c HTTP/1.1\r\nHost: x\r\n\r\n')
            self.assertIn(s.recv(64)[:12], (b'HTTP/1.1 400', b'HTTP/1.1 404'))

    def test_websocket_flow_contract(self):
        allowed = f'http://localhost:{self.http_port}'
        client = self.connect_ws(origin=allowed)
        first = json.loads(client.recv(timeout=5))
        self.assertEqual(first['type'], 'relay_status')
        self.assertIn(first['state'], ('waiting', 'stale'))
        # fresh telemetry -> live status followed by the packet itself
        # (1 s status heartbeats may interleave, so wait for the data packet)
        self.data.write_text(telemetry(players=[{'id': '1', 'name': 'Du', 'damage': 10,
                                                 'dps': 10, 'damageShare': 100.0}]), encoding='utf-8')
        deadline, status, packet = time.time() + 5, None, None
        while time.time() < deadline:
            message = json.loads(client.recv(timeout=5))
            if message.get('type') == 'relay_status':
                status = message
                continue
            packet = message
            break
        self.assertEqual((status or {}).get('state'), 'live')
        self.assertEqual((status or {}).get('path'), str(self.data).replace('/', '\\'))
        self.assertIsNotNone(packet)
        self.assertEqual(packet['game'], 'wilds')
        self.assertEqual(packet['players'][0]['name'], 'Du')
        # a reconnecting client receives snapshot + fresh payload again
        late = self.connect_ws(origin='https://mhdps.sengakujiworks.com')
        json.loads(late.recv(timeout=5))                    # snapshot
        again = json.loads(late.recv(timeout=5))
        self.assertEqual(again['quest']['status'], 'in_progress')
        late.close()
        # Lua's empty player table {} must arrive as []
        self.data.write_text('{"schemaVersion":1,"source":"mhdps-wilds","game":"wilds",'
                             '"quest":{"id":"t:2","status":"idle","timeSeconds":0},'
                             '"players":{},"diagnostics":{"version":"0.1.5"}}', encoding='utf-8')
        deadline, fixed = time.time() + 5, None
        while time.time() < deadline:
            message = json.loads(client.recv(timeout=5))
            if message.get('type') != 'relay_status':
                fixed = message
                break
        self.assertIsNotNone(fixed)
        self.assertEqual(fixed['players'], [])
        self.assertEqual(fixed['quest']['status'], 'idle')
        # oversized telemetry is never broadcast (status heartbeats keep coming)
        self.data.write_text('{"game":"wilds","quest":{"status":"idle","timeSeconds":0},'
                             '"players":[], "pad":"' + 'x' * 2_100_000 + '"}', encoding='utf-8')
        deadline, saw_data = time.time() + 2.5, False
        while time.time() < deadline:
            try:
                message = json.loads(client.recv(timeout=1))
            except TimeoutError:
                break
            if message.get('type') != 'relay_status':
                saw_data = True
                break
        self.assertFalse(saw_data)
        # silence for >5 s flips the relay to stale, payload is dropped
        self.data.unlink()
        deadline, stale = time.time() + 10, False
        while time.time() < deadline:
            message = json.loads(client.recv(timeout=10))
            if message.get('type') == 'relay_status' and message['state'] in ('stale', 'waiting'):
                stale = True
                break
        self.assertTrue(stale)
        self.assertIn(self.health()['state'], ('stale', 'waiting'))
        client.close()

    def test_websocket_rejects_foreign_origin(self):
        from websockets.exceptions import InvalidStatus
        with self.assertRaises(InvalidStatus) as ctx:
            self.connect_ws(origin='http://evil.example')
        self.assertEqual(ctx.exception.response.status_code, 403)


if __name__ == '__main__':
    unittest.main()
