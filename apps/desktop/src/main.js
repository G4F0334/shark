import {
  app,
  BrowserWindow,
  desktopCapturer,
  screen,
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

function pickDisplaySource(sources) {
  if (sources.length === 0) return undefined;
  const screenSources = sources.filter((s) => s.id.startsWith('screen:'));
  if (screenSources.length === 0) return sources[0];

  const primaryId = String(screen.getPrimaryDisplay().id);
  return (
    screenSources.find((s) => s.display_id === primaryId) ?? screenSources[0]
  );
}

function registerDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer
      .getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1, height: 1 },
        fetchWindowIcons: false
      })
      .then((sources) => {
        const video = pickDisplaySource(sources);
        if (!video) {
          callback({});
          return;
        }
        const streams = { video };
        if (request.audioRequested) {
          streams.audio = 'loopback';
        }
        callback(streams);
      })
      .catch(() => callback({}));
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
  registerDisplayMediaHandler();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
