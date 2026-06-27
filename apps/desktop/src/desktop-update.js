import { ipcMain, shell } from 'electron';

export function registerDesktopUpdateIpc() {
  ipcMain.handle('desktop:open-update-download', async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'invalid-url' };
    }

    await shell.openExternal(url);
    return { ok: true };
  });
}
