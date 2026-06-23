import { BrowserWindow, desktopCapturer, ipcMain } from 'electron';
import path from 'node:path';
import {
  attachApplicationLoopbackStdoutPcm,
  getApplicationLoopbackDiagnostics,
  markApplicationLoopbackPcmConsumerReady,
  resolveApplicationLoopbackExe,
  startApplicationLoopbackForDesktopShare,
  stopApplicationLoopbackChild
} from './application-loopback.js';
import { getSharkordSession } from './session-config.js';

/** @type {Map<number, 'application-loopback'|'chromium-loopback'>} */
const displayMediaAudioRouteByWebContentsId = new Map();

/** @type {{ webContentsId: number; route: 'application-loopback' | 'chromium-loopback'; at: number } | null} */
let lastDisplayMediaAudioRoute = null;

/**
 * @param {number} webContentsId
 * @param {'application-loopback' | 'chromium-loopback'} route
 */
function setDisplayMediaAudioRoute(webContentsId, route) {
  displayMediaAudioRouteByWebContentsId.set(webContentsId, route);
  lastDisplayMediaAudioRoute = { webContentsId, route, at: Date.now() };
}

/**
 * @param {number} senderId
 * @returns {'application-loopback' | 'chromium-loopback' | 'none'}
 */
function consumeDisplayMediaAudioRoute(senderId) {
  const direct = displayMediaAudioRouteByWebContentsId.get(senderId);
  if (direct) {
    displayMediaAudioRouteByWebContentsId.delete(senderId);
    return direct;
  }

  const recent = lastDisplayMediaAudioRoute;
  if (recent && Date.now() - recent.at < 60_000) {
    displayMediaAudioRouteByWebContentsId.delete(recent.webContentsId);
    lastDisplayMediaAudioRoute = null;
    return recent.route;
  }

  return 'none';
}

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

  /** @type {BrowserWindow | null} */
  let pickerParentWindow = null;

  /**
   * @type {{
   *   callback: (streams: DisplayMediaStreams) => void;
   *   audioRequested: boolean;
   *   sharkExcludePid: number | null;
   *   hostWebContents: import('electron').WebContents | null;
   * } | null}
   */
  let pending = null;

  function denyDisplayMediaCallback(callback) {
    setImmediate(() => {
      try {
        callback({});
      } catch {
        // Electron 34+ throws when video was requested but not provided.
        // Renderer still receives AbortError from getDisplayMedia.
      }
    });
  }

  function denyPendingRequest({ closeWindow = true } = {}) {
    if (!pending) {
      if (closeWindow) closePicker();
      return;
    }

    const { callback } = pending;
    pending = null;
    stopApplicationLoopbackChild();

    if (closeWindow) closePicker();

    denyDisplayMediaCallback(callback);
  }

  function closePicker({ restoreFocus = true } = {}) {
    const parent = pickerParentWindow;

    if (pickerWindow && !pickerWindow.isDestroyed()) {
      pickerWindow.removeAllListeners('closed');
      pickerWindow.hide();
      pickerWindow.destroy();
    }

    pickerWindow = null;
    pickerParentWindow = null;

    if (restoreFocus && parent && !parent.isDestroyed()) {
      setImmediate(() => {
        if (!parent.isDestroyed()) {
          parent.show();
          parent.focus();
        }
      });
    }
  }

  /**
   * @param {BrowserWindow} parent
   * @param {BrowserWindow} picker
   */
  function centerPickerOnParent(parent, picker) {
    try {
      const parentBounds = parent.getBounds();
      const pickerBounds = picker.getBounds();
      const x = Math.round(
        parentBounds.x + (parentBounds.width - pickerBounds.width) / 2
      );
      const y = Math.round(
        parentBounds.y + (parentBounds.height - pickerBounds.height) / 2
      );

      picker.setPosition(x, y, false);
    } catch {
      picker.center();
    }
  }

  /**
   * @param {BrowserWindow | null} parent
   * @param {boolean} audioRequested
   */
  function openPickerUi(parent, audioRequested) {
    closePicker({ restoreFocus: false });

    pickerParentWindow =
      parent && !parent.isDestroyed() ? parent : null;

    pickerWindow = new BrowserWindow({
      modal: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      width: 720,
      height: 600,
      minWidth: 480,
      minHeight: 420,
      title: audioRequested
        ? 'Демонстрация экрана и звука'
        : 'Демонстрация экрана',
      autoHideMenuBar: true,
      backgroundColor: '#252525',
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      },
      show: false
    });

    pickerWindow.once('ready-to-show', () => {
      if (!pickerWindow || pickerWindow.isDestroyed()) return;

      if (pickerParentWindow && !pickerParentWindow.isDestroyed()) {
        centerPickerOnParent(pickerParentWindow, pickerWindow);
      } else {
        pickerWindow.center();
      }

      pickerWindow.show();
      pickerWindow.focus();
    });

    pickerWindow.on('closed', () => {
      pickerWindow = null;
      denyPendingRequest({ closeWindow: false });
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

  /**
   * @param {import('electron').WebContents | null | undefined} stored
   * @param {BrowserWindow | null | undefined} parentWindow
   * @returns {import('electron').WebContents | null}
   */
  function resolveHostWebContents(stored, parentWindow) {
    if (
      stored &&
      typeof stored.isDestroyed === 'function' &&
      !stored.isDestroyed()
    ) {
      return stored;
    }

    const parent =
      parentWindow && !parentWindow.isDestroyed() ? parentWindow : null;
    const parentWc = parent?.webContents;
    if (
      parentWc &&
      typeof parentWc.isDestroyed === 'function' &&
      !parentWc.isDestroyed()
    ) {
      return parentWc;
    }

    const focused = BrowserWindow.getFocusedWindow();
    if (focused && !focused.isDestroyed()) {
      const focusedWc = focused.webContents;
      if (
        focusedWc &&
        typeof focusedWc.isDestroyed === 'function' &&
        !focusedWc.isDestroyed()
      ) {
        return focusedWc;
      }
    }

    return null;
  }

  /**
   * @param {import('electron').WebContents | null | undefined} hostWc
   * @param {number | null | undefined} cachedPid
   * @returns {number | null}
   */
  function resolveSharkExcludePid(hostWc, cachedPid) {
    if (typeof cachedPid === 'number' && cachedPid > 0) return cachedPid;

    if (
      hostWc &&
      typeof hostWc.isDestroyed === 'function' &&
      !hostWc.isDestroyed()
    ) {
      try {
        const pid = hostWc.getOSProcessId();
        if (typeof pid === 'number' && pid > 0) return pid;
      } catch {
        // ignore
      }
    }

    return null;
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
    getSharkordSession().setDisplayMediaRequestHandler((request, callback) => {
      if (pending) {
        denyDisplayMediaCallback(callback);
        return;
      }

      pending = {
        callback,
        audioRequested: Boolean(request.audioRequested),
        sharkExcludePid: osPidExcludeSharkAudio(request),
        hostWebContents: request.frame?.hostWebContents ?? null
      };

      openPickerUi(
        parentWindowFromRequest(request),
        Boolean(request.audioRequested)
      );
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

      const {
        callback,
        audioRequested,
        sharkExcludePid,
        hostWebContents
      } = pending;
      pending = null;

      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1, height: 1 },
        fetchWindowIcons: false
      });
      const video = sources.find((s) => s.id === sourceId);

      if (!video) {
        stopApplicationLoopbackChild();
        closePicker();
        denyDisplayMediaCallback(callback);
        return { ok: false, error: 'Источник больше не доступен.' };
      }

      /** @type {DisplayMediaStreams} */
      const streams = { video };

      if (audioRequested) {
        if (process.platform === 'win32') {
          const hostWc = resolveHostWebContents(
            hostWebContents,
            pickerParentWindow
          );
          const hostOk = hostWc != null;
          const isScreen = video.id.startsWith('screen:');
          const excludePid = resolveSharkExcludePid(hostWc, sharkExcludePid);

          if (hostOk) {
            const exePath = resolveApplicationLoopbackExe(srcDir);
            const albChild = startApplicationLoopbackForDesktopShare({
              exePath,
              isScreen,
              windowSourceId: video.id,
              windowSourceName: video.name,
              sharkExcludePid: excludePid ?? 0
            });

            if (albChild != null) {
              attachApplicationLoopbackStdoutPcm(hostWc);
              setDisplayMediaAudioRoute(hostWc.id, 'application-loopback');
            } else {
              streams.audio = 'loopback';
              setDisplayMediaAudioRoute(hostWc.id, 'chromium-loopback');
            }
          } else {
            streams.audio = 'loopback';
            console.warn(
              '[display-media] host webContents unavailable — ApplicationLoopback skipped, chromium loopback only'
            );
          }

          setImmediate(() =>
            console.info(
              '[display-media] ApplicationLoopback',
              getApplicationLoopbackDiagnostics()
            )
          );
        } else {
          streams.audio = 'loopback';
          stopApplicationLoopbackChild();
        }
      } else {
        stopApplicationLoopbackChild();
      }

      callback(streams);
      closePicker();
      return { ok: true };
    });

    ipcMain.handle('desktop:display-media:cancel', async () => {
      denyPendingRequest();
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
      const audioRoute = consumeDisplayMediaAudioRoute(event.sender.id);
      return { audioRoute };
    });
    ipcMain.handle('desktop:application-loopback-pcm-ready', (event) =>
      markApplicationLoopbackPcmConsumerReady(event.sender)
    );
  }

  return { registerIpc, registerSessionHandler, stopApplicationLoopbackChild };
}

export { createDisplayMediaPickerController };
