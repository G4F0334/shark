import { Tray, Menu, nativeImage, ipcMain, app } from 'electron';
import path from 'node:path';
import { focusMainWindow, GetMainWindow } from './main.js';
import { getIconsDir } from './paths.js';

const ImageStatus = {
  inactive: 'prog.png',
  active: 'off.png',
  speaking: 'on.png',
  micmuted: 'mic.png',
  soundmute: 'headset.png'
};

let tray;
let forceQuit = false;

function getImageStatus(state) {
  const iconPath = path.join(getIconsDir(), ImageStatus[state] ?? ImageStatus.inactive);
  const icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    console.error('Tray icon not found or empty:', iconPath);
  }

  return icon;
}

function showFromTray() {
  focusMainWindow();
}

function quitApp() {
  forceQuit = true;

  const mainWindow = GetMainWindow();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }

  app.quit();
}

function createTrayIcon() {
  const icon = getImageStatus('inactive');

  if (icon.isEmpty()) {
    console.error('Skipping tray creation: icon is empty');
    return;
  }

  tray = new Tray(icon);
  tray.setToolTip('Sharkord');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Открыть', click: () => showFromTray() },
    {
      label: 'Выход',
      click: () => {
        quitApp();
      }
    }
  ]);

  tray.on('double-click', () => {
    showFromTray();
  });

  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createTrayIcon();
});

export function CloseState(mainWindow) {
  mainWindow.on('close', (event) => {
    if (!forceQuit) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

export { quitApp };

let status = 'inactive';
let oldStatus = 'inactive';

ipcMain.handle('desktop:voice-activity', async (_self, state) => {
  status = state;
});

setInterval(() => {
  if (!tray || status === oldStatus) return;

  oldStatus = status;
  const icon = getImageStatus(status);

  if (!icon.isEmpty()) {
    tray.setImage(icon);
  }
}, 100);
