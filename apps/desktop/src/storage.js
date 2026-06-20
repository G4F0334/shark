import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const storagePath = () => path.join(app.getPath('userData'), 'local-storage.json');

const readStore = () => {
  try {
    const raw = fs.readFileSync(storagePath(), 'utf8');
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (data) => {
  const filePath = storagePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data));
};

export function registerDesktopStorageIpc() {
  ipcMain.handle('desktop:storage-read-all', async () => readStore());

  ipcMain.handle('desktop:storage-set', async (_event, key, value) => {
    if (typeof key !== 'string') return { ok: false };

    const data = readStore();
    data[key] = String(value);
    writeStore(data);

    return { ok: true };
  });

  ipcMain.handle('desktop:storage-remove', async (_event, key) => {
    if (typeof key !== 'string') return { ok: false };

    const data = readStore();
    delete data[key];
    writeStore(data);

    return { ok: true };
  });
}
