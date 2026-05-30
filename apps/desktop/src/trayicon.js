import { BrowserWindow, desktopCapturer, Tray, Menu, nativeImage, ipcMain, session, app } from 'electron';
import { RunWebCode, GetMainWindow } from './main.js';
import path from 'node:path';

let tray;

import { fileURLToPath } from "url";
import { appendFileSync } from 'node:fs';

const ImageStatus = {
    'inactive': 'prog.png',
    'active': 'off.png',
    'speaking': 'on.png',
    'micmuted': 'mic.png',
    'soundmute': 'headset.png'
}

let forceQuit = false;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(path.dirname(__filename));

function getImageStatus(state) {
    const iconPath = path.join(__dirname, "icons", ImageStatus[state]);
    return nativeImage.createFromPath(iconPath);
}

function showFromTray() {
    const mainWindow = GetMainWindow();

    if (!appendFileSync) return;

    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
}

function createTrayIcon() {
    const icon = getImageStatus('inactive');

    console.log(icon.isEmpty());

    tray = new Tray(icon);

    tray.setToolTip("My Electron App");

    const contextMenu = Menu.buildFromTemplate([
        { label: "Открыть", click: () => showFromTray() },
        {
            label: "Выход", click: () => {
                forceQuit = true;
                app.quit();
            }
        }
    ]);

    tray.on("double-click", () => {
        showFromTray();
    });

    tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
    createTrayIcon();
});

export function CloseState(mainWindow) {
    mainWindow.on("close", (event) => {
        if (!forceQuit) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

let status = 'inactive';

ipcMain.handle('desktop:voice-activity', async (self, state) => {
    status = state;
    console.log("Voice activity state:", state);
});

setInterval(() => {
    const icon = getImageStatus(status);
    tray.setImage(icon);
}, 50)
