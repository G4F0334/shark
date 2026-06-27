import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyWebRtcGpuEncodingPreferences } from './apply-webrtc-gpu-switches.js';
import { createDisplayMediaPickerController } from './display-media-picker.js';
import { createMainWindow } from './create-main-window.js';
import { installKnownChromiumStderrIgnore } from './ignore-known-chromium-stderr.js';
import { installDesktopLogging } from './logger.js';
import './hotkeys.js';
import { registerDesktopStorageIpc } from './storage.js';
import { CloseState } from './trayicon.js';
import { registerDesktopUpdateIpc } from './desktop-update.js';

installKnownChromiumStderrIgnore();

applyWebRtcGpuEncodingPreferences();

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const displayPicker = createDisplayMediaPickerController({ srcDir });
let mainWindow;

const focusMainWindow = () => {
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
};

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    focusMainWindow();
  });

  app.whenReady().then(() => {
    installDesktopLogging();
    registerDesktopStorageIpc();
    registerDesktopUpdateIpc();
    displayPicker.registerIpc();
    displayPicker.registerSessionHandler();
    mainWindow = createMainWindow({ srcDir });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow({ srcDir });
        CloseState(mainWindow);
        return;
      }

      focusMainWindow();
    });

    CloseState(mainWindow);
  });
}

export function RunWebCode(code) {
  if (!mainWindow) return;

  mainWindow.webContents.executeJavaScript(code);
}

export function GetMainWindow() {
  return mainWindow;
}

export { focusMainWindow };

app.on('before-quit', () => {
  displayPicker.stopApplicationLoopbackChild();
});

app.on('window-all-closed', () => {
  // Keep tray app running on Windows/Linux when the main window is hidden.
});
