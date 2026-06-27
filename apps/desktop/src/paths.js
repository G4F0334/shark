import { app } from 'electron';
import path from 'node:path';

export function getIconsDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icons');
  }

  return path.join(app.getAppPath(), 'icons');
}

/**
 * Preload scripts must live outside app.asar when sandbox is enabled.
 * @param {string} fileName e.g. "preload.cjs"
 */
export function getPreloadPath(fileName) {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'src',
      fileName
    );
  }

  return path.join(app.getAppPath(), 'src', fileName);
}
