import { BrowserWindow } from 'electron';
import path from 'node:path';

/**
 * @param {object} opts
 * @param {string} opts.srcDir Absolute path to `apps/desktop/src`
 */
function createMainWindow({ srcDir }) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(srcDir, 'preload.cjs'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:sharkord'
    },
    show: false
  });

  win.once('ready-to-show', () => win.show());

  if (process.env.SHARKORD_ENV === 'development') {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadURL('https://sharkapi.ping-net.kz/');
  }

  return win;
}

export { createMainWindow };
