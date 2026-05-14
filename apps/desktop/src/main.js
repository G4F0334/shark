import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  session
} from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Prefer HW H.264 (Media Foundation / VideoToolbox) over OpenH264 in WebRTC. */
function applyWebRtcGpuEncodingPreferences() {
  if (process.env.DESKTOP_WEBRTC_SOFTWARE_H264 === '1') return;

  const platform = process.platform;
  if (platform !== 'win32' && platform !== 'darwin') return;

  app.commandLine.appendSwitch('force_high_performance_gpu');
  app.commandLine.appendSwitch('disable-features', 'OpenH264SoftwareEncoder');
}

applyWebRtcGpuEncodingPreferences();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {BrowserWindow | null} */
let displayPickerWindow = null;

/** @type {{ callback: (s: Record<string, unknown>) => void; audioRequested: boolean } | null} */
let pendingDisplayMedia = null;

function closeDisplayPickerWindow() {
  if (displayPickerWindow && !displayPickerWindow.isDestroyed()) {
    displayPickerWindow.removeAllListeners('closed');
    displayPickerWindow.close();
  }
  displayPickerWindow = null;
}

/**
 * @param {BrowserWindow | null} parent
 * @param {boolean} audioRequested
 */
function createDisplayPickerWindow(parent, audioRequested) {
  closeDisplayPickerWindow();

  displayPickerWindow = new BrowserWindow({
    parent: parent ?? undefined,
    modal: Boolean(parent),
    width: 680,
    height: 560,
    minWidth: 420,
    minHeight: 360,
    title: audioRequested ? 'Выбор экрана и звука' : 'Выбор экрана',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    show: false
  });

  displayPickerWindow.once('ready-to-show', () => displayPickerWindow?.show());

  displayPickerWindow.on('closed', () => {
    displayPickerWindow = null;
    if (pendingDisplayMedia) {
      const cb = pendingDisplayMedia.callback;
      pendingDisplayMedia = null;
      cb({});
    }
  });

  displayPickerWindow.loadFile(
    path.join(__dirname, '..', 'renderer', 'display-picker.html')
  );
}

/** @param {Electron.DisplayMediaRequestHandlerHandlerRequest} req */
function parentWindowFromDisplayMediaRequest(req) {
  try {
    const frame = req.frame;
    const wc = frame?.hostWebContents;
    if (wc) {
      const win = BrowserWindow.fromWebContents(wc);
      if (win && !win.isDestroyed()) return win;
    }
  } catch {
    // ignore
  }
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  const all = BrowserWindow.getAllWindows();
  return all.find((w) => !w.isDestroyed()) ?? null;
}

function registerDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (pendingDisplayMedia) {
      callback({});
      return;
    }

    const parentWin = parentWindowFromDisplayMediaRequest(request);
    const audioRequested = Boolean(request.audioRequested);

    pendingDisplayMedia = {
      callback,
      audioRequested
    };

    createDisplayPickerWindow(parentWin, audioRequested);
  });
}

function registerDisplayPickerIpc() {
  ipcMain.handle('desktop:display-media:list-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });

    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      display_id: s.display_id,
      isScreen: s.id.startsWith('screen:'),
      thumb: s.thumbnail.toDataURL()
    }));
  });

  ipcMain.handle('desktop:display-media:submit', async (_evt, payload) => {
    const sourceId =
      typeof payload === 'string'
        ? payload
        : typeof payload?.sourceId === 'string'
          ? payload.sourceId
          : '';

    if (!sourceId || !pendingDisplayMedia) {
      return { ok: false, error: 'Запрос демонстрации недействителен или устарел.' };
    }

    const audioRequested = pendingDisplayMedia.audioRequested;
    const cb = pendingDisplayMedia.callback;
    pendingDisplayMedia = null;

    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 1, height: 1 },
      fetchWindowIcons: false
    });
    const video = sources.find((s) => s.id === sourceId);
    if (!video) {
      cb({});
      closeDisplayPickerWindow();
      return { ok: false, error: 'Источник больше не доступен.' };
    }

    const streams = { video };
    if (audioRequested) {
      streams.audio = 'loopback';
    }
    cb(streams);
    closeDisplayPickerWindow();
    return { ok: true };
  });

  ipcMain.handle('desktop:display-media:cancel', async () => {
    if (pendingDisplayMedia) {
      const cb = pendingDisplayMedia.callback;
      pendingDisplayMedia = null;
      cb({});
    }
    closeDisplayPickerWindow();
    return { ok: true };
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    show: false
  });

  win.once('ready-to-show', () => win.show());

  win.loadURL('http://localhost:5173');
}

app.whenReady().then(() => {
  registerDisplayPickerIpc();
  registerDisplayMediaHandler();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
