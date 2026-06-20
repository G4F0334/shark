import { app } from 'electron';
import path from 'node:path';

export function getIconsDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icons');
  }

  return path.join(app.getAppPath(), 'icons');
}
