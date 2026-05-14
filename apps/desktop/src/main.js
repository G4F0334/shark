import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyWebRtcGpuEncodingPreferences } from './apply-webrtc-gpu-switches.js';
import { createDisplayMediaPickerController } from './display-media-picker.js';
import { createMainWindow } from './create-main-window.js';

applyWebRtcGpuEncodingPreferences();

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const displayPicker = createDisplayMediaPickerController({ srcDir });

app.whenReady().then(() => {
  displayPicker.registerIpc();
  displayPicker.registerSessionHandler();
  createMainWindow({ srcDir });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow({ srcDir });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
