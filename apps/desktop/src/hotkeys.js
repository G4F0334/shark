import { BrowserWindow, desktopCapturer, ipcMain, session } from 'electron';
import { UiohookKey, uIOhook } from "uiohook-napi";
import { RunWebCode } from './main.js';

let hotkeys = [];

export function loadHotKeys(keys) {
    console.log("Loading hotkeys", keys);
    try {
        hotkeys = JSON.parse(keys);
        console.log("Loaded hotkeys", hotkeys);
    } catch (err) {
        hotkeys = [];
        console.error("Failed to parse hotkeys", err);
    }
}

ipcMain.handle('desktop:reload-hotkeys', async (self, keys) => {
    loadHotKeys(keys)
    return { ok: true };
});

export const KEY_MAP = {
    29: "Control",
    42: "Shift",
    56: "Alt",
    3675: "Meta",

    30: "A",
    48: "B",
    46: "C",
    32: "D",
    18: "E",
    33: "F",
    34: "G",
    35: "H",
    23: "I",
    36: "J",
    37: "K",
    38: "L",
    50: "M",
    49: "N",
    24: "O",
    25: "P",
    16: "Q",
    19: "R",
    31: "S",
    20: "T",
    22: "U",
    47: "V",
    17: "W",
    45: "X",
    21: "Y",
    44: "Z",

    2: "Digit1",
    3: "Digit2",
    4: "Digit3",
    5: "Digit4",
    6: "Digit5",
    7: "Digit6",
    8: "Digit7",
    9: "Digit8",
    10: "Digit9",
    11: "Digit0",

    28: "Enter",
    14: "Backspace",
    15: "Tab",
    57: "Space"
};

let bind = null;
let pressedKeys = new Set();

uIOhook.on("keydown", (e) => {
    if (bind)
        return;

    pressedKeys.add(KEY_MAP[e.keycode]);

    for (const h of hotkeys) {
        const allPressed = h.keys.every(k => {
            return pressedKeys.has(k);
        })

        if (allPressed) {
            bind = h
        }
    }
});

uIOhook.on("keyup", (e) => {
    pressedKeys.delete(KEY_MAP[e.keycode]);

    if (!bind)
        return;

    const someKeysPressed = bind.keys.some(k => {
        return KEY_MAP[e.keycode] === k;
    })

    if (someKeysPressed) {
        RunWebCode(`toggleMicG()`);
        bind = null;
    }
});

uIOhook.start();