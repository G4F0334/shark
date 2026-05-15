import { BrowserWindow, desktopCapturer, ipcMain, session } from 'electron';
import path from 'node:path';
import {
  attachApplicationLoopbackStdoutPcm,
  getApplicationLoopbackDiagnostics,
  markApplicationLoopbackPcmConsumerReady,
  resolveApplicationLoopbackExe,
  startApplicationLoopbackForDesktopShare,
  stopApplicationLoopbackChild
} from './application-loopback.js';

/**
 * После выбора источника демонстрации — куда брать дорожку SCREEN_AUDIO.
 * @type {Map<number, 'application-loopback'|'chromium-loopback'>}
 */
const displayMediaAudioRouteByWebContentsId = new Map();

/**
 * @typedef {import('electron').DisplayMediaRequestHandlerStreams} DisplayMediaStreams
 */

/**
 * @param {object} opts
 * @param {string} opts.srcDir Absolute path to `apps/desktop/src`
 */
function createDisplayMediaPickerController({ srcDir }) {
  const preloadPath = path.join(srcDir, 'preload.cjs');
  const pickerHtmlPath = path.join(srcDir, '..', 'renderer', 'display-picker.html');

  /** @type {BrowserWindow | null} */
  let pickerWindow = null;

  /**
   * sharkExcludePid — PID renderer'а основного окна Sharkord (не окна picker).
   * hostWebContents — вкладка, вызвавшая getDisplayMedia (куда слать PCM с exe).
   * @type {{ callback: (streams: DisplayMediaStreams) => void; audioRequested: boolean; sharkExcludePid: number | null; hostWebContents: import('electron').WebContents | null } | null}
   */
  let pending = null;

  function closePicker() {
    if (pickerWindow && !pickerWindow.isDestroyed()) {
      pickerWindow.removeAllListeners('closed');
      pickerWindow.close();
    }
    pickerWindow = null;
  }

  /**
   * @param {BrowserWindow | null} parent
   * @param {boolean} audioRequested
   */
  function openPickerUi(parent, audioRequested) {
    closePicker();

    pickerWindow = new BrowserWindow({
      parent: parent ?? undefined,
      modal: Boolean(parent),
      width: 680,
      height: 560,
      minWidth: 420,
      minHeight: 360,
      title: audioRequested ? 'Выбор экрана и звука' : 'Выбор экрана',
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      },
      show: false
    });

    pickerWindow.once('ready-to-show', () => pickerWindow?.show());

    pickerWindow.on('closed', () => {
      pickerWindow = null;
      if (pending) {
        stopApplicationLoopbackChild();
        const cb = pending.callback;
        pending = null;
        cb({});
      }
    });

    pickerWindow.loadFile(pickerHtmlPath);
  }

  /** @param {Electron.DisplayMediaRequestHandlerHandlerRequest} req */
  function parentWindowFromRequest(req) {
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
    return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null;
  }

  /** Renderer PID, который запросил getDisplayMedia (исключить его звук при screen + loopback). */
  function osPidExcludeSharkAudio(req) {
    try {
      const host = req.frame?.hostWebContents;
      if (host && typeof host.getOSProcessId === 'function') {
        const p = host.getOSProcessId();
        if (Number.isFinite(p) && p > 0) return p;
      }
    } catch {
      // ignore
    }
    try {
      const win = parentWindowFromRequest(req);
      const wc = win?.webContents;
      if (wc && typeof wc.getOSProcessId === 'function') {
        const p = wc.getOSProcessId();
        if (Number.isFinite(p) && p > 0) return p;
      }
    } catch {
      // ignore
    }
    return null;
  }

  function registerSessionHandler() {
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      if (pending) {
        callback({});
        return;
      }

      pending = {
        callback,
        audioRequested: Boolean(request.audioRequested),
        sharkExcludePid: osPidExcludeSharkAudio(request),
        hostWebContents: request.frame?.hostWebContents ?? null
      };

      openPickerUi(parentWindowFromRequest(request), Boolean(request.audioRequested));
    });
  }

  function registerIpc() {
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

      if (!sourceId || !pending) {
        return {
          ok: false,
          error: 'Запрос демонстрации недействителен или устарел.'
        };
      }

      const { audioRequested, callback: cb, sharkExcludePid, hostWebContents } =
        pending;
      pending = null;

      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1, height: 1 },
        fetchWindowIcons: false
      });
      const video = sources.find((s) => s.id === sourceId);
      if (!video) {
        stopApplicationLoopbackChild();
        cb({});
        closePicker();
        return { ok: false, error: 'Источник больше не доступен.' };
      }

      /** @type {DisplayMediaStreams} */
      const streams = { video };
      if (audioRequested) {
        if (process.platform === 'win32') {
          const exePath = resolveApplicationLoopbackExe(srcDir);
          const albChild = startApplicationLoopbackForDesktopShare({
            exePath,
            isScreen: video.id.startsWith('screen:'),
            windowSourceId: video.id,
            sharkExcludePid: sharkExcludePid ?? 0
          });

          const hostOk =
            hostWebContents != null &&
            typeof hostWebContents.isDestroyed === 'function' &&
            !hostWebContents.isDestroyed();

          if (albChild != null && hostOk) {
            attachApplicationLoopbackStdoutPcm(hostWebContents);
            displayMediaAudioRouteByWebContentsId.set(
              hostWebContents.id,
              'application-loopback'
            );
          } else {
            if (albChild != null && !hostOk) {
              stopApplicationLoopbackChild();
            }
            streams.audio = 'loopback';
            if (hostOk) {
              displayMediaAudioRouteByWebContentsId.set(
                hostWebContents.id,
                'chromium-loopback'
              );
            }
          }

          setImmediate(() =>
            console.info('[display-media] ApplicationLoopback', getApplicationLoopbackDiagnostics())
          );
        } else {
          streams.audio = 'loopback';
          stopApplicationLoopbackChild();
        }
      } else stopApplicationLoopbackChild();
      cb(streams);
      closePicker();
      return { ok: true };
    });

    ipcMain.handle('desktop:display-media:cancel', async () => {
      stopApplicationLoopbackChild();
      if (pending) {
        const cb = pending.callback;
        pending = null;
        cb({});
      }
      closePicker();
      return { ok: true };
    });
    ipcMain.handle('desktop:application-loopback-stop', async () => {
      stopApplicationLoopbackChild();
      return { ok: true };
    });
    ipcMain.handle('desktop:application-loopback-diagnostics', async () => ({
      ok: true,
      diagnostics: getApplicationLoopbackDiagnostics()
    }));
    ipcMain.handle('desktop:consume-display-media-audio-route', (event) => {
      const key = event.sender.id;
      const audioRoute = displayMediaAudioRouteByWebContentsId.get(key) ?? 'none';
      displayMediaAudioRouteByWebContentsId.delete(key);
      return { audioRoute };
    });
    ipcMain.handle('desktop:application-loopback-pcm-ready', (event) =>
      markApplicationLoopbackPcmConsumerReady(event.sender)
    );
  }

  return { registerIpc, registerSessionHandler, stopApplicationLoopbackChild };
}

export { createDisplayMediaPickerController };
