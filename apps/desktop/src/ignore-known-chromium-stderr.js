/** Один раз оборачивает stderr: убирает шумный лог WGC (скринкаст Windows), текст остаётся в Chromium. */

const SNIPPETS = [
  /** [wgc_capture_session.cc(228)] ProcessFrame failed, using existing frame: -2147467259 (E_FAIL) */
  ['wgc_capture_session.cc', 'ProcessFrame failed, using existing frame']
];

/** @param {string} s */
function shouldIgnoreChromiumStderr(s) {
  return SNIPPETS.some((parts) => parts.every((p) => s.includes(p)));
}

export function installKnownChromiumStderrIgnore() {
  if (process.platform !== 'win32') return;

  const stderr = process.stderr;
  const original = stderr.write.bind(stderr);

  stderr.write = function (...args) {
    const chunk = args[0];
    const encoding = args[1];
    let str = '';
    if (typeof chunk === 'string') str = chunk;
    else if (Buffer.isBuffer(chunk))
      str = chunk.toString(typeof encoding === 'string' ? encoding : 'utf8');
    else if (chunk != null) str = String(chunk);

    if (shouldIgnoreChromiumStderr(str)) {
      const cb = typeof encoding === 'function' ? encoding : args[2];
      if (typeof cb === 'function') queueMicrotask(cb);
      return true;
    }
    return original.apply(stderr, args);
  };
}
