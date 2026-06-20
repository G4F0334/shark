import { ipcMain } from 'electron';
import { uIOhook } from 'uiohook-napi';
import { GetMainWindow, RunWebCode } from './main.js';

let hotkeys = [];

function normalizeHotkeys(parsed) {
  if (Array.isArray(parsed)) {
    return parsed
      .filter((item) => item && typeof item === 'object' && item.id && item.keys)
      .map((item) => ({
        id: String(item.id),
        keys: Array.isArray(item.keys) ? item.keys : []
      }));
  }

  if (parsed && typeof parsed === 'object') {
    return Object.entries(parsed).map(([id, keys]) => ({
      id,
      keys: Array.isArray(keys) ? keys : []
    }));
  }

  return [];
}

export function loadHotKeys(keys) {
  try {
    if (!keys || String(keys).trim() === '') {
      hotkeys = [];
      return;
    }

    hotkeys = normalizeHotkeys(JSON.parse(keys));
  } catch (err) {
    hotkeys = [];
    console.error('Failed to parse hotkeys', err);
  }
}

ipcMain.handle('desktop:reload-hotkeys', async (_self, keys) => {
  loadHotKeys(keys);
  return { ok: true };
});

ipcMain.handle('desktop:change-hotkey', async (_self, newHotkey) => {
  const existing = hotkeys.find((h) => h.id === newHotkey.id);

  if (existing) {
    existing.keys = newHotkey.keys;
  } else {
    hotkeys.push({
      id: newHotkey.id,
      keys: newHotkey.keys
    });
  }

  return { ok: true };
});

export const KEY_MAP = {
  29: 'Control',
  3613: 'Control',
  42: 'Shift',
  54: 'Shift',
  56: 'Alt',
  3640: 'Alt',
  3675: 'Meta',
  3676: 'Meta',

  30: 'A',
  48: 'B',
  46: 'C',
  32: 'D',
  18: 'E',
  33: 'F',
  34: 'G',
  35: 'H',
  23: 'I',
  36: 'J',
  37: 'K',
  38: 'L',
  50: 'M',
  49: 'N',
  24: 'O',
  25: 'P',
  16: 'Q',
  19: 'R',
  31: 'S',
  20: 'T',
  22: 'U',
  47: 'V',
  17: 'W',
  45: 'X',
  21: 'Y',
  44: 'Z',

  2: 'Digit1',
  3: 'Digit2',
  4: 'Digit3',
  5: 'Digit4',
  6: 'Digit5',
  7: 'Digit6',
  8: 'Digit7',
  9: 'Digit8',
  10: 'Digit9',
  11: 'Digit0',

  28: 'Enter',
  14: 'Backspace',
  15: 'Tab',
  57: 'Space'
};

const isAppFocused = () => {
  const win = GetMainWindow();
  return win?.isFocused() ?? false;
};

let bind = null;
const pressedKeys = new Set();

uIOhook.on('keydown', (e) => {
  if (isAppFocused()) return;

  if (bind) return;

  const key = KEY_MAP[e.keycode];

  if (!key) return;

  pressedKeys.add(key);

  for (const h of hotkeys) {
    const allPressed = h.keys.every((k) => pressedKeys.has(k));

    if (allPressed) {
      bind = h;
    }
  }
});

uIOhook.on('keyup', (e) => {
  const key = KEY_MAP[e.keycode];

  if (key) {
    pressedKeys.delete(key);
  }

  if (isAppFocused()) {
    bind = null;
    return;
  }

  if (!bind) return;

  const someKeysPressed = bind.keys.some((k) => key === k);

  if (someKeysPressed) {
    RunWebCode(`RunHotkey("${bind.id}")`);
    bind = null;
  }
});

uIOhook.start();
