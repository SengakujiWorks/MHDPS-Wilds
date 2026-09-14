import asyncio
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('startup', Path(__file__).parents[1]/'relay/startup.py')
startup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(startup)

class StartupTests(unittest.TestCase):
    def test_choice_validation_and_persistence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'startup.json'
            self.assertIsNone(startup.load_choice(path))
            for value in ('local', 'online'):
                startup.save_choice(value, path)
                self.assertEqual(startup.load_choice(path), value)
            with self.assertRaises(ValueError):
                startup.save_choice('https://untrusted.example', path)
            path.write_text('{bad')
            self.assertIsNone(startup.load_choice(path))

    def test_browser_destinations(self):
        for choice, url in [('local',startup.LOCAL_URL),('online',startup.PUBLIC_URL),(None,None)]:
            with patch.object(startup,'choose_dashboard',return_value=choice), patch.object(startup.webbrowser,'open') as browser:
                startup.open_dashboard()
                if url: browser.assert_called_once_with(url)
                else: browser.assert_not_called()

    @unittest.skipUnless(os.name=='nt','Windows process lifetime')
    def test_real_process_lifetime_and_single_instance(self):
        first=startup.SingleInstance()
        second=startup.SingleInstance()
        try:
            self.assertFalse(first.existing)
            self.assertTrue(second.existing)
        finally:
            second.close(); first.close()
        process=subprocess.Popen([sys.executable,'-c','import time; time.sleep(0.2)'])
        session=startup.GameSession(process.pid)
        try:
            asyncio.run(asyncio.wait_for(session.wait(),5))
            process.wait(timeout=5)
        finally:
            session.close()
            if process.poll() is None: process.terminate()
