import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyWebRtcGpuEncodingPreferences } from './apply-webrtc-gpu-switches.js';
import { createDisplayMediaPickerController } from './display-media-picker.js';
import { createMainWindow } from './create-main-window.js';
import { installKnownChromiumStderrIgnore } from './ignore-known-chromium-stderr.js';
import './hotkeys.js';
import { CloseState } from './trayicon.js';

installKnownChromiumStderrIgnore();

applyWebRtcGpuEncodingPreferences();

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const displayPicker = createDisplayMediaPickerController({ srcDir });
let mainWindow;

app.whenReady().then(() => {
  displayPicker.registerIpc();
  displayPicker.registerSessionHandler();
  mainWindow = createMainWindow({ srcDir });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow({ srcDir });
  });

  CloseState(mainWindow);
});

export function RunWebCode(code) {
  mainWindow.webContents.executeJavaScript(code);
}

export function GetMainWindow() {
  return mainWindow;
}

app.on('before-quit', () => {
  displayPicker.stopApplicationLoopbackChild();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
