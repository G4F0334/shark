import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app } from 'electron';

/** @type {import('child_process').ChildProcessWithoutNullStreams | null} */
let loopbackChild = null;

/** @returns {string} Абсолютный путь к ApplicationLoopback.exe. */
export function resolveApplicationLoopbackExe(srcDir) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'lib', 'ApplicationLoopback.exe');
  }
  return path.join(srcDir, '..', 'lib', 'ApplicationLoopback.exe');
}

export function stopApplicationLoopbackChild() {
  const c = loopbackChild;
  loopbackChild = null;
  if (!c?.pid) return;
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

/** @returns {bigint | null} */
export function hwndU64FromWindowSourceId(sourceId) {
  const m = /^window:(\d+):(\d+)$/.exec(sourceId ?? '');
  if (!m) return null;
  const low = BigInt(m[1]);
  const high = BigInt(m[2]);
  return (high << 32n) | low;
}

function hwndCandidates(sourceId) {
  const u = hwndU64FromWindowSourceId(sourceId);
  if (u === null) return [];

  const low = Number(u & 0xffffffffn);
  const high = Number(u >> 32n);

  /** @param {number} hi @param {number} lo */
  const pack = (hi, lo) => (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);

  const uniq = [...new Set([u, pack(low, high), pack(high, low), BigInt(low), BigInt(high)])];
  return uniq.filter((x) => x !== 0n);
}

/** @param {bigint} hwndU64 */
function pidFromHwndUnchecked(hwndU64) {
  const hDec = hwndU64.toString(10);
  if (!/^[0-9]+$/.test(hDec)) return null;

  const dir = mkdtempSync(path.join(tmpdir(), 'shk-alb-'));
  const psPath = path.join(dir, 'gwp.ps1');
  writeFileSync(
    psPath,
    `$ErrorActionPreference='Stop'\nAdd-Type @"
using System;
using System.Runtime.InteropServices;
public static class Wx {
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint lp);
 public static uint P(string dec) {
  ulong u = UInt64.Parse(dec);
  unchecked { var ip = new IntPtr((long)u); uint p = 0; Wx.GetWindowThreadProcessId(ip, out p); return p; }
 }
}
"@
[Wx]::P('${hDec}')
`,
    'utf8'
  );

  try {
    const outBuf = execFileSync('powershell.exe', ['-NoProfile', '-STA', '-File', psPath], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 8000
    });

    const line = String(outBuf).trim().split(/\s+/)[0];
    const n = Number.parseInt(line ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /**/
    }
  }
}

/** PID процесса окна для `window:<low>:<high>` (перебираем возможные(HWND). */
export function pidFromDesktopWindowSourceId(sourceId) {
  if (process.platform !== 'win32') return null;

  const cands = hwndCandidates(sourceId);
  for (const h of cands) {
    const p = pidFromHwndUnchecked(h);
    if (p !== null && p > 0) return p;
  }

  return null;
}

/**
 * Окно: `ApplicationLoopback <pid>` (только это приложение и дочерние).
 * Экран: `ApplicationLoopback -x <pid>` (весь mixback кроме PID рендерера Sharkord).
 */
export function startApplicationLoopbackForDesktopShare(opts) {
  stopApplicationLoopbackChild();

  if (process.platform !== 'win32') return null;

  const { exePath, isScreen, windowSourceId, sharkExcludePid } = opts;

  if (!existsSync(exePath)) {
    console.warn('[ApplicationLoopback] Файл не найден:', exePath);
    return null;
  }

  /** @type {readonly string[]} */
  let argv;

  if (isScreen) {
    if (!Number.isFinite(sharkExcludePid) || sharkExcludePid < 1) {
      console.warn('[ApplicationLoopback] Неверный sharkExcludePid для режима экрана.');
      return null;
    }
    argv = ['-x', String(sharkExcludePid)];
  } else {
    const wpid = pidFromDesktopWindowSourceId(windowSourceId);
    if (!wpid) {
      console.warn('[ApplicationLoopback] Не удалось определить PID окна:', windowSourceId);
      return null;
    }
    argv = [String(wpid)];
  }

  const child = spawn(exePath, [...argv], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  child.stdout?.resume?.();
  child.stderr?.resume?.();

  child.on('error', (err) => {
    console.warn('[ApplicationLoopback] spawn error:', err);
  });

  child.on('exit', (code, signal) => {
    if (loopbackChild?.pid !== child.pid) return;
    if (signal || code === null) console.warn('[ApplicationLoopback] завершён:', code, signal);
    else if (code !== 0) console.warn('[ApplicationLoopback] код:', code);
  });

  loopbackChild = child;
  console.info('[ApplicationLoopback]', exePath, ...argv);
  return child;
}
