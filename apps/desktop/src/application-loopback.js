import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/** @type {import('child_process').ChildProcessWithoutNullStreams | null} */
let loopbackChild = null;

const LOG_PREFIX = '[ApplicationLoopback]';

/**
 * @typedef {{
 *   exePath: string;
 *   exeExists: boolean;
 *   childRunning: boolean;
 *   childPid: number | null;
 *   lastArgv: readonly string[];
 *   lastSpawnUnixMs: number | null;
 *   lastExitCode: number | null;
 *   lastExitSignal: string | null;
 *   lastIssue: string | null;
 * }} TApplicationLoopbackDiagnostics
 */

/** @type {TApplicationLoopbackDiagnostics} */
const diag = {
  exePath: '',
  exeExists: false,
  childRunning: false,
  childPid: null,
  lastArgv: [],
  lastSpawnUnixMs: null,
  lastExitCode: null,
  lastExitSignal: null,
  lastIssue: null
};

function syncDiagFromChild() {
  const c = loopbackChild;
  if (!c) {
    diag.childRunning = false;
    diag.childPid = null;
    return;
  }
  const alive = c.exitCode === null && !c.killed;
  diag.childRunning = alive;
  diag.childPid = alive ? c.pid ?? null : null;
}

/** @returns {TApplicationLoopbackDiagnostics} */
export function getApplicationLoopbackDiagnostics() {
  syncDiagFromChild();
  return {
    exePath: diag.exePath,
    exeExists: diag.exeExists,
    childRunning: diag.childRunning,
    childPid: diag.childPid,
    lastArgv: [...diag.lastArgv],
    lastSpawnUnixMs: diag.lastSpawnUnixMs,
    lastExitCode: diag.lastExitCode,
    lastExitSignal: diag.lastExitSignal,
    lastIssue: diag.lastIssue
  };
}

/** stdout — только бинарный PCM (s16le stereo 48k), не парсить как utf-8 */
/** @param {import('stream').Readable | null} stream @param {'err'} kind */
function pipeChildLines(stream, kind) {
  if (!stream) return;
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buf += chunk;
    const parts = buf.split(/\n/);
    buf = parts.pop() ?? '';
    for (const line of parts) {
      if (line.length) console.info(`${LOG_PREFIX}:${kind}`, line);
    }
  });
  stream.on('end', () => {
    if (buf.length) console.info(`${LOG_PREFIX}:${kind}`, buf);
  });
}

const FRAME_BYTES = 4;
const MAX_PCM_BACKLOG_BYTES = 48000 * FRAME_BYTES / 2;

/** @type {import('electron').WebContents | null} */
let pcmRouteWebContents = null;
/** @type {((chunk: Buffer) => void) | null} */
let stdoutBinaryListener = null;
let pcmCarry = Buffer.alloc(0);
let pcmBacklog = Buffer.alloc(0);
let pcmConsumerReady = false;

/** @param {import('electron').WebContents} wc @param {Buffer} block frame-aligned */
function sendPcmToWebContents(wc, block) {
  if (block.length === 0 || wc.isDestroyed()) return;
  try {
    wc.send('desktop:application-loopback-pcm', block);
  } catch {
    /**/
  }
}

function flushPcmBacklog() {
  const wc = pcmRouteWebContents;
  if (!wc || wc.isDestroyed()) {
    pcmBacklog = Buffer.alloc(0);
    return;
  }
  const merged = Buffer.concat([pcmBacklog, pcmCarry]);
  const n = Math.floor(merged.length / FRAME_BYTES) * FRAME_BYTES;
  pcmCarry = merged.subarray(n);
  if (n > 0) sendPcmToWebContents(wc, merged.subarray(0, n));
  pcmBacklog = Buffer.alloc(0);
}

/**
 * После успешного spawn: PCM с stdout в renderer (IPC). Chromium loopback отключаем.
 * @param {import('electron').WebContents | null | undefined} webContents
 * @returns {void}
 */
export function attachApplicationLoopbackStdoutPcm(webContents) {
  detachApplicationLoopbackStdoutPcm(false);
  if (!webContents || webContents.isDestroyed() || !loopbackChild?.stdout) return;

  pcmRouteWebContents = webContents;
  pcmCarry = Buffer.alloc(0);
  pcmBacklog = Buffer.alloc(0);
  pcmConsumerReady = false;

  stdoutBinaryListener = (chunk) => {
    const raw = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const merged = Buffer.concat([pcmCarry, raw]);
    const n = Math.floor(merged.length / FRAME_BYTES) * FRAME_BYTES;
    pcmCarry = merged.subarray(n);
    const block = merged.subarray(0, n);
    if (block.length === 0) return;
    if (!pcmConsumerReady) {
      pcmBacklog = Buffer.concat([pcmBacklog, block]).slice(-MAX_PCM_BACKLOG_BYTES);
      return;
    }
    sendPcmToWebContents(pcmRouteWebContents, block);
  };

  loopbackChild.stdout.on('data', stdoutBinaryListener);
}

/**
 * @param {boolean} [sendEnd=true]
 * @returns {void}
 */
export function detachApplicationLoopbackStdoutPcm(sendEnd = true) {
  if (loopbackChild?.stdout && stdoutBinaryListener) {
    loopbackChild.stdout.removeListener('data', stdoutBinaryListener);
  }
  stdoutBinaryListener = null;
  pcmCarry = Buffer.alloc(0);
  pcmBacklog = Buffer.alloc(0);
  pcmConsumerReady = false;
  const wc = pcmRouteWebContents;
  pcmRouteWebContents = null;
  if (sendEnd && wc && !wc.isDestroyed()) {
    try {
      wc.send('desktop:application-loopback-pcm-end');
    } catch {
      /**/
    }
  }
}

/**
 * Renderer вызвал после подписки на IPC — сбрасываем backlog.
 * @param {import('electron').WebContents} wc
 * @returns {{ ok: boolean }}
 */
export function markApplicationLoopbackPcmConsumerReady(wc) {
  if (!pcmRouteWebContents || pcmRouteWebContents.id !== wc.id) return { ok: false };
  pcmConsumerReady = true;
  flushPcmBacklog();
  return { ok: true };
}

/** @returns {string} Абсолютный путь к ApplicationLoopback.exe. */
export function resolveApplicationLoopbackExe(srcDir) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'lib', 'ApplicationLoopback.exe');
  }
  return path.join(srcDir, '..', 'lib', 'ApplicationLoopback.exe');
}

export function stopApplicationLoopbackChild() {
  detachApplicationLoopbackStdoutPcm(true);
  const c = loopbackChild;
  loopbackChild = null;
  syncDiagFromChild();
  if (!c?.pid) return;
  console.info(`${LOG_PREFIX} stop taskkill tree pid=%d`, c.pid);
  try {
    c.stdin?.destroy?.();
  } catch {
    /**/
  }
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(c.pid), '/f', '/t'], {
        windowsHide: true,
        stdio: 'ignore'
      }).unref();
    } else {
      c.kill('SIGKILL');
    }
  } catch {
    /**/
  }
}

/** @returns {bigint | null} Electron `window:XX:YY` — XX is handle, YY is process flag (0/1). */
export function hwndU64FromWindowSourceId(sourceId) {
  const m = /^window:(\d+):(\d+)$/.exec(sourceId ?? '');
  if (!m) return null;
  return BigInt(m[1]);
}

function hwndCandidates(sourceId) {
  const m = /^window:(\d+):(\d+)$/.exec(sourceId ?? '');
  if (!m) return [];

  const xx = Number(m[1]);
  const yy = Number(m[2]);
  /** @type {number[]} */
  const handles = [];

  if (Number.isFinite(xx) && xx > 0) handles.push(xx);

  // Older/alternate encodings — YY sometimes carried extra handle bits.
  if (yy > 1 && Number.isFinite(yy)) {
    const packed = Number((BigInt(yy) << 32n) | BigInt(xx >>> 0));
    if (packed > 0) handles.push(packed);
  }

  return [...new Set(handles.filter((h) => h > 0))];
}

const PS_WIN32 = String.raw`if (-not ('ShkWin' -as [type])) {
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ShkWin {
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
  public static uint PidFromHwnd(long hwnd) {
    if (hwnd <= 0) return 0;
    var ip = new IntPtr(hwnd);
    if (!IsWindow(ip)) return 0;
    uint p = 0;
    GetWindowThreadProcessId(ip, out p);
    return p;
  }
  public static uint PidFromTitle(string title) {
    if (string.IsNullOrWhiteSpace(title)) return 0;
    uint found = 0;
    EnumWindows((h, l) => {
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, 512);
      if (sb.ToString() == title) {
        GetWindowThreadProcessId(h, out found);
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
}`;

/** @param {string} tail */
function runWin32Ps(tail) {
  const outBuf = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-NoLogo', '-Command', `${PS_WIN32}\n${tail}`],
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 1024 * 1024
    }
  );

  const line = String(outBuf).trim().split(/\s+/)[0];
  const n = Number.parseInt(line ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** @param {number} hwnd */
function pidFromHwndUnchecked(hwnd) {
  if (!Number.isFinite(hwnd) || hwnd <= 0) return null;

  try {
    return runWin32Ps(`[ShkWin]::PidFromHwnd(${hwnd})`);
  } catch (error) {
    console.warn(`${LOG_PREFIX} PidFromHwnd failed hwnd=${hwnd}`, error);
    return null;
  }
}

/** @param {string} title */
function pidFromWindowTitle(title) {
  if (!title) return null;

  const escaped = title.replace(/'/g, "''");

  try {
    return runWin32Ps(`[ShkWin]::PidFromTitle('${escaped}')`);
  } catch (error) {
    console.warn(`${LOG_PREFIX} PidFromTitle failed title=${title}`, error);
    return null;
  }
}

/**
 * PID процесса окна для `window:<handle>:<flag>`.
 * @param {string | undefined | null} sourceId
 * @param {string | undefined | null} [windowTitle]
 * @returns {number | null}
 */
export function pidFromDesktopWindowSourceId(sourceId, windowTitle) {
  if (process.platform !== 'win32') return null;

  for (const hwnd of hwndCandidates(sourceId ?? '')) {
    const p = pidFromHwndUnchecked(hwnd);
    if (p !== null && p > 0) {
      console.info(`${LOG_PREFIX} window pid via hwnd`, { sourceId, hwnd, pid: p });
      return p;
    }
  }

  if (windowTitle) {
    const p = pidFromWindowTitle(windowTitle);
    if (p !== null && p > 0) {
      console.info(`${LOG_PREFIX} window pid via title`, {
        sourceId,
        windowTitle,
        pid: p
      });
      return p;
    }
  }

  console.warn(`${LOG_PREFIX} window pid unresolved`, { sourceId, windowTitle });
  return null;
}

/** @returns {readonly string[]} */
function buildArgv(opts) {
  const { isScreen, windowSourceId, windowSourceName, sharkExcludePid } = opts;
  if (isScreen) {
    if (!Number.isFinite(sharkExcludePid) || sharkExcludePid < 1) return [];
    return ['-x', String(sharkExcludePid)];
  }
  const wpid = pidFromDesktopWindowSourceId(windowSourceId, windowSourceName);
  if (!wpid) return [];
  return [String(wpid)];
}

/**
 * Окно: `ApplicationLoopback <pid>` (только это приложение и дочерние).
 * Экран: `ApplicationLoopback -x <pid>` (весь mixback кроме PID рендерера Sharkord).
 * @returns {import('child_process').ChildProcessWithoutNullStreams | null}
 */
export function startApplicationLoopbackForDesktopShare(opts) {
  stopApplicationLoopbackChild();

  if (process.platform !== 'win32') {
    diag.exePath = '';
    diag.exeExists = false;
    diag.lastArgv = [];
    diag.lastIssue = 'platform_not_win32';
    diag.lastSpawnUnixMs = null;
    console.info(`${LOG_PREFIX} skip: not Windows`);
    return null;
  }

  const { exePath, isScreen, windowSourceId, windowSourceName, sharkExcludePid } = opts;
  diag.exePath = exePath;
  diag.exeExists = existsSync(exePath);
  diag.lastExitCode = null;
  diag.lastExitSignal = null;

  if (!diag.exeExists) {
    diag.lastArgv = [];
    diag.lastIssue = 'exe_not_found';
    diag.lastSpawnUnixMs = null;
    console.warn(
      `${LOG_PREFIX} exe не найден, остаётся только Chromium desktop loopback:`,
      exePath
    );
    return null;
  }

  const argv = buildArgv({
    isScreen,
    windowSourceId,
    windowSourceName,
    sharkExcludePid
  });
  diag.lastArgv = [exePath, ...argv];

  if (argv.length === 0) {
    diag.lastIssue = isScreen ? 'invalid_shark_exclude_pid' : 'window_pid_unresolved';
    diag.lastSpawnUnixMs = null;
    console.warn(
      `${LOG_PREFIX} helper не запущен (${diag.lastIssue}) isScreen=${isScreen} sharkExcludePid=${sharkExcludePid} sourceId=${windowSourceId} sourceName=${windowSourceName ?? ''}; звук — через стандартный Chromium loopback`
    );
    return null;
  }

  const child = spawn(exePath, [...argv], {
    windowsHide: true,
    /** живой stdin-пайп: при `'ignore'` сразу EOF → exe жалуется на getchar и выходит */
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false
  });

  if (child.stdin) {
    child.stdin.once('error', () => {});
  }

  pipeChildLines(child.stderr, 'err');

  child.once('spawn', () => {
    diag.lastSpawnUnixMs = Date.now();
    diag.lastIssue = null;
    syncDiagFromChild();
    console.info(`${LOG_PREFIX} spawn ok pid=${child.pid} args: ${argv.join(' ')}`);
  });

  child.on('error', (err) => {
    diag.lastIssue = `spawn_error:${err.message}`;
    console.warn(`${LOG_PREFIX} spawn error:`, err);
  });

  child.on('exit', (code, signal) => {
    const tracked = loopbackChild === child;
    if (tracked) detachApplicationLoopbackStdoutPcm(true);
    if (tracked) loopbackChild = null;
    if (tracked) {
      diag.lastExitCode = code !== null ? code : null;
      diag.lastExitSignal = signal ?? null;
    }
    syncDiagFromChild();
    console.info(
      `${LOG_PREFIX} exit pid=${child.pid} wasTracked=${tracked} code=${code} signal=${signal ?? ''}`
    );
    if (tracked && (signal || code === null))
      console.warn(`${LOG_PREFIX} аварийное завершение helper — проверьте права и совместимость exe`);
    else if (tracked && code !== 0 && code !== null)
      console.warn(
        `${LOG_PREFIX} helper вышел с кодом ${code}; при демонстрации звук может остаться только на Chromium loopback`
      );
  });

  loopbackChild = child;
  syncDiagFromChild();
  console.info(`${LOG_PREFIX} spawning… ${argv.join(' ')}`);
  return child;
}
