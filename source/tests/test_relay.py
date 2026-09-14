import asyncio
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve

spec=importlib.util.spec_from_file_location('relay',Path(__file__).parents[1]/'relay/relay.py')
r=importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
def packet():
    return {'game':'wilds','quest':{'id':'q1','status':'in_progress','timeSeconds':10},'players':[{'id':'1','name':'Hunter','damage':200,'dps':20,'damageShare':100}]}

class ProtocolTests(unittest.TestCase):
    def test_double_encoded_and_lua_empty(self):
        self.assertEqual(r.parse_packet(json.dumps(json.dumps(packet()))),packet())
        p=packet(); p['players']={}
        self.assertEqual(r.parse_packet(json.dumps(p))['players'],[])
    def test_reject_invalid(self):
        for bad in [[],{}, {'game':'wilds'}, dict(packet(), players='bad')]:
            with self.assertRaises(ValueError): r.parse_packet(json.dumps(bad))
        p=packet(); p['players'][0]['damage']=float('nan')
        with self.assertRaises(ValueError): r.parse_packet(json.dumps(p))
    def test_explicit_path(self):
        self.assertEqual(r.discover_paths('/game')[0],Path('/game/reframework/data/dps_live.json'))

class RelayTests(unittest.IsolatedAsyncioTestCase):
    async def test_partial_write_retry_stale_and_newest(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'a.json'; p.write_text('{')
            relay=r.Relay([p], stale_after=1)
            await relay.poll(); self.assertIsNone(relay.signature)
            p.write_text(json.dumps(packet())); await relay.poll()
            self.assertEqual(relay.payload['players'][0]['damage'],200)
            q=Path(folder)/'b.json'; new=packet(); new['players'][0]['damage']=300
            q.write_text(json.dumps(new)); os.utime(q,(time.time()+.1,time.time()+.1))
            relay.paths.append(q); await relay.poll(); self.assertEqual(relay.payload['players'][0]['damage'],300)
            relay.last_seen=time.time()-2; await relay.poll(); self.assertIsNone(relay.payload)
    async def test_socket_delivery_and_origin_rejection(self):
        relay=r.Relay([])
        async with serve(relay.register,'127.0.0.1',0,origins=r.ORIGINS) as server:
            port=server.sockets[0].getsockname()[1]
            async with connect(f'ws://127.0.0.1:{port}',origin=r.ORIGINS[0]) as ws:
                self.assertEqual(json.loads(await ws.recv())['state'],'waiting')
                await relay.broadcast(packet())
                self.assertEqual(json.loads(await ws.recv())['quest']['id'],'q1')
            with self.assertRaises(Exception):
                async with connect(f'ws://127.0.0.1:{port}',origin='https://unrelated.example'): pass

if __name__=='__main__': unittest.main()
