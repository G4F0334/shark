import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

/** @type {import('node:fs').WriteStream | null} */
let logStream = null;

/** @type {string | null} */
let logFilePath = null;

let loggingInstalled = false;

function shouldWriteToFile() {
  return app.isPackaged || process.env.SHARKORD_LOG_FILE === '1';
}

function serialize(value) {
  if (value instanceof Error) {
    return value.stack || value.message;
  }

  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return util.inspect(value, { depth: 4, breakLength: 120 });
    }
  }

  return String(value);
}

/** @param {string} message */
function cleanRendererMessage(message) {
  return message
    .replace(/%c\s*/g, '')
    .replace(/\bcolor:\s*[^;]+;\s*/gi, '')
    .replace(/\bfont-weight:\s*[^;]+;\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * @param {'DEBUG' | 'INFO' | 'WARN' | 'ERROR'} level
 * @param {string} scope
 * @param {unknown[]} args
 */
function formatLine(level, scope, args) {
  const ts = new Date().toISOString();
  const message = args.map(serialize).join(' ');

  return `[${ts}] [${level}] [${scope}] ${message}\n`;
}

function ensureLogStream() {
  if (logStream || !shouldWriteToFile()) return;

  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    logFilePath = path.join(dir, `sharkord-${date}.log`);
    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  } catch (error) {
    console.error('[logger] failed to open log file', error);
  }
}

/**
 * @param {'DEBUG' | 'INFO' | 'WARN' | 'ERROR'} level
 * @param {string} scope
 * @param {unknown[]} args
 */
function writeLog(level, scope, args) {
  if (!shouldWriteToFile()) return;

  ensureLogStream();

  if (!logStream) return;

  try {
    logStream.write(formatLine(level, scope, args));
  } catch {
    /**/
  }
}

export function getDesktopLogFilePath() {
  ensureLogStream();
  return logFilePath;
}

export function installDesktopLogging() {
  if (loggingInstalled) return;
  loggingInstalled = true;

  if (!shouldWriteToFile()) return;

  ensureLogStream();

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console)
  };

  /** @param {'DEBUG' | 'INFO' | 'WARN' | 'ERROR'} level */
  const patch = (method, level) => {
    console[method] = (...args) => {
      original[method](...args);
      writeLog(level, 'main', args);
    };
  };

  patch('log', 'INFO');
  patch('info', 'INFO');
  patch('warn', 'WARN');
  patch('error', 'ERROR');
  patch('debug', 'DEBUG');

  process.on('uncaughtException', (error) => {
    writeLog('ERROR', 'process', [
      'uncaughtException',
      error?.stack || error
    ]);
  });

  process.on('unhandledRejection', (reason) => {
    writeLog('ERROR', 'process', ['unhandledRejection', reason]);
  });

  writeLog('INFO', 'app', [
    'Desktop logging started',
    {
      version: app.getVersion(),
      packaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch,
      userData: app.getPath('userData'),
      resourcesPath: process.resourcesPath,
      logFile: logFilePath
    }
  ]);
}

/**
 * @param {import('electron').WebContents} webContents
 */
export function attachRendererLogging(webContents) {
  if (!shouldWriteToFile() || !webContents) return;

  /** @type {Record<number, 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'>} */
  const levelMap = {
    0: 'DEBUG',
    1: 'INFO',
    2: 'WARN',
    3: 'ERROR'
  };

  webContents.on('console-message', (_event, level, message) => {
    writeLog(levelMap[level] ?? 'INFO', 'renderer', [cleanRendererMessage(message)]);
  });

  webContents.on('render-process-gone', (_event, details) => {
    writeLog('ERROR', 'renderer', ['render-process-gone', details]);
  });

  webContents.on('did-fail-load', (
    _event,
    errorCode,
    errorDescription,
    validatedURL,
    isMainFrame
  ) => {
    if (!isMainFrame) return;

    writeLog('ERROR', 'renderer', [
      'did-fail-load',
      { errorCode, errorDescription, validatedURL }
    ]);
  });
}
