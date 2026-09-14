"""Automatic game-session lifetime and first-run dashboard choice."""
import asyncio
import ctypes
import json
import os
from pathlib import Path
import webbrowser

PUBLIC_URL = 'https://mhdps.sengakujiworks.com'
LOCAL_URL = 'http://localhost:8080'
CONFIG = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'MHDPS' / 'startup.json'


def load_choice(path=CONFIG):
    try:
        value = json.loads(path.read_text(encoding='utf-8')).get('dashboard')
        return value if value in ('online', 'local') else None
    except (OSError, ValueError, AttributeError):
        return None


def save_choice(choice, path=CONFIG):
    if choice not in ('online', 'local'):
        raise ValueError('Invalid dashboard choice')
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps({'dashboard': choice}), encoding='utf-8')
    temporary.replace(path)


def choose_dashboard():
    choice = load_choice()
    if choice:
        return choice
    import tkinter as tk
    root = tk.Tk()
    root.title('MHDPS · Willkommen / Welcome')
    root.resizable(False, False)
    selected = []
    tk.Label(root, text='Wo soll MHDPS beim Spielstart geöffnet werden?\nWhere should MHDPS open when the game starts?', padx=24, pady=20).pack()
    def select(value):
        save_choice(value)
        selected.append(value)
        root.destroy()
    tk.Button(root, text='Homepage · mit Zuschauerlinks / with spectator links', command=lambda: select('online'), padx=12, pady=8).pack(fill='x', padx=24, pady=4)
    tk.Button(root, text='Lokal / Local · nur für mich / just for me', command=lambda: select('local'), padx=12, pady=8).pack(fill='x', padx=24, pady=4)
    tk.Label(root, text='Gespeichert für die nächsten Starts.\nSaved for future game launches.', pady=14).pack()
    root.mainloop()
    return selected[0] if selected else None


def open_dashboard():
    choice = choose_dashboard()
    if choice:
        webbrowser.open(PUBLIC_URL if choice == 'online' else LOCAL_URL)


class GameSession:
    def __init__(self, pid):
        self.api = ctypes.WinDLL('kernel32', use_last_error=True)
        self.api.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
        self.api.OpenProcess.restype = ctypes.c_void_p
        self.api.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
        self.api.CloseHandle.argtypes = [ctypes.c_void_p]
        self.handle = self.api.OpenProcess(0x100000, False, pid)
        if not self.handle:
            raise OSError('Cannot monitor game process')

    async def wait(self):
        while self.api.WaitForSingleObject(self.handle, 0) == 258:
            await asyncio.sleep(1)

    def close(self):
        self.api.CloseHandle(self.handle)


class SingleInstance:
    def __init__(self):
        self.api = ctypes.WinDLL('kernel32', use_last_error=True)
        self.api.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
        self.api.CreateMutexW.restype = ctypes.c_void_p
        self.api.CloseHandle.argtypes = [ctypes.c_void_p]
        self.handle = self.api.CreateMutexW(None, False, 'Local\\MHDPS.Companion.v1')
        self.existing = ctypes.get_last_error() == 183
        if not self.handle:
            raise OSError('Cannot acquire companion instance lock')

    def close(self):
        self.api.CloseHandle(self.handle)
