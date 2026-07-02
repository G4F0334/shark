import { BrowserWindow } from 'electron';
import { attachRendererLogging } from './logger.js';
import { getPreloadPath } from './paths.js';
import { SHARKORD_SESSION_PARTITION } from './session-config.js';

const APP_BACKGROUND = '#0a0a0a';

function getTargetUrl() {
  if (process.env.SHARKORD_ENV === 'development') {
    return 'http://localhost:5173';
  }

  return 'https://gentleman-minimal-furniture-camcorder.trycloudflare.com/';

  // return 'https://sharkapi.ping-net.kz/';
}

/**
 * @param {import('electron').BrowserWindow} win
 */
function setupMainWindowRecovery(win) {
  const targetUrl = getTargetUrl();
  let retryTimer = null;
  let retryAttempt = 0;

  const clearRetryTimer = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleRetry = () => {
    clearRetryTimer();
    retryAttempt += 1;
    const delayMs = Math.min(
      30_000,
      Math.round(1000 * 1.5 ** Math.max(0, retryAttempt - 1))
    );

    retryTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      void loadTarget();
    }, delayMs);
  };

  const loadTarget = async () => {
    if (win.isDestroyed()) return;

    clearRetryTimer();

    try {
      await win.loadURL(targetUrl);
    } catch (error) {
      console.error('[main-window] loadURL failed', error);
      scheduleRetry();
    }
  };

  win.webContents.on('did-finish-load', () => {
    if (win.isDestroyed()) return;

    const currentUrl = win.webContents.getURL();
    if (currentUrl === targetUrl || currentUrl.startsWith(`${targetUrl}/`)) {
      retryAttempt = 0;
      clearRetryTimer();
    }
  });

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      if (
        validatedURL !== targetUrl &&
        !validatedURL.startsWith(`${targetUrl}/`)
      ) {
        return;
      }

      console.error('[main-window] did-fail-load', {
        errorCode,
        errorDescription,
        validatedURL
      });
      scheduleRetry();
    }
  );

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main-window] render-process-gone', details);

    if (win.isDestroyed()) return;

    retryAttempt = 0;
    void loadTarget();
  });

  return loadTarget;
}

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
    backgroundColor: APP_BACKGROUND,
    webPreferences: {
      preload: getPreloadPath('preload.cjs'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: SHARKORD_SESSION_PARTITION
    },
    show: false
  });

  const loadTarget = setupMainWindowRecovery(win);

  attachRendererLogging(win.webContents);

  win.once('ready-to-show', () => win.show());

  void loadTarget();

  return win;
}

export { createMainWindow };
