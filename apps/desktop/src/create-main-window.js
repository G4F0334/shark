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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    show: false
  });

  win.once('ready-to-show', () => win.show());

  win.loadURL('http://localhost:5173');
  return win;
}

export { createMainWindow };
