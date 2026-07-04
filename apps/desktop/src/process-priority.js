import { app } from 'electron';
import os from 'node:os';

const PRIORITY_REFRESH_MS = 10_000;
const PRIORITY_PROCESS_TYPES = new Set([
  'Browser',
  'GPU',
  'Renderer',
  'Utility'
]);

const getHighPriority = () => os.constants.priority?.PRIORITY_HIGH ?? -14;

const setProcessPriority = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return;

  try {
    os.setPriority(pid, getHighPriority());
  } catch (error) {
    console.warn('[process-priority] failed to raise process priority', {
      pid,
      error
    });
  }
};

const boostDesktopProcessPriority = () => {
  if (process.env.DESKTOP_DISABLE_PRIORITY_BOOST === '1') return;

  setProcessPriority(process.pid);

  for (const metric of app.getAppMetrics()) {
    if (!PRIORITY_PROCESS_TYPES.has(metric.type)) continue;

    setProcessPriority(metric.pid);
  }
};

const installDesktopProcessPriorityBoost = () => {
  if (process.env.DESKTOP_DISABLE_PRIORITY_BOOST === '1') return;

  boostDesktopProcessPriority();

  const intervalId = setInterval(
    boostDesktopProcessPriority,
    PRIORITY_REFRESH_MS
  );
  intervalId.unref?.();

  app.on('before-quit', () => {
    clearInterval(intervalId);
  });
};

export { installDesktopProcessPriorityBoost };
