import { resetApp } from '@/features/app/actions';
import { resetDialogs } from '@/features/dialogs/actions';
import { resetServerScreens } from '@/features/server-screens/actions';
import { connect, onReconnectSuccess, resetServerState, restoreVoiceAfterReconnect, setDisconnectInfo, setServerReconnecting, softDisconnectFromServer, unsubscribeServerEvents } from '@/features/server/actions';
import { playSound } from '@/features/server/sounds/actions';
import { SoundType } from '@/features/server/types';
import { getHostFromServer } from '@/helpers/get-file-url';
import { getSessionStorageItem, LocalStorageKey, removeLocalStorageItem, removeSessionStorageItem, SessionStorageKey } from '@/helpers/storage';
import { DisconnectCode, type AppRouter, type TConnectionParams } from '@sharkord/shared';
import { TRPCClientError, createTRPCProxyClient, createWSClient, wsLink } from '@trpc/client';

const RECONNECT_GRACE_MS = 15_000;

let wsClient: ReturnType<typeof createWSClient> | null = null;
let trpc: ReturnType<typeof createTRPCProxyClient<AppRouter>> | null = null;
let currentHost: string | null = null;
let isCleaningUp = false;
let isManualDisconnect = false;

let gracePeriodStartedAt: number | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let fullDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

// Firefox fires WebSocket onClose during page refresh; Chrome does not. When navigating away,
// we must not clear auto-login localStorage or it will be lost on refresh in Firefox.
let isNavigatingAway = false;
window.addEventListener('beforeunload', () => {
  isNavigatingAway = true;
});

const clearReconnectTimers = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (fullDisconnectTimer) {
    clearTimeout(fullDisconnectTimer);
    fullDisconnectTimer = null;
  }

  gracePeriodStartedAt = null;
  reconnectAttempts = 0;
};

const isUnexpectedDisconnect = (cause?: CloseEvent) =>
  !cause || cause.code === DisconnectCode.UNEXPECTED || cause.code === 1006;

const isServerInitiatedDisconnect = (cause: CloseEvent) =>
  cause.code === DisconnectCode.KICKED ||
  cause.code === DisconnectCode.BANNED ||
  cause.code === DisconnectCode.SERVER_SHUTDOWN;

const softCloseWs = () => {
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }

  trpc = null;
};

const isAuthError = (err: unknown): boolean => {
  if (err instanceof TRPCClientError) {
    return err.data?.code === 'UNAUTHORIZED';
  }

  return false;
};

const tryReconnect = async (): Promise<boolean> => {
  const host = currentHost;

  if (!host) {
    console.warn('Try reconnect called but no host stored');
    return false;
  }

  try {
    softCloseWs();
    initializeTRPC(host);
    unsubscribeServerEvents();
    await connect();
    clearReconnectTimers();
    onReconnectSuccess();
    await restoreVoiceAfterReconnect();
    console.log('Reconnected to server');
    return true;
  } catch (error) {
    console.warn('Reconnect attempt failed', error);

    if (isAuthError(error)) {
      clearReconnectTimers();
      cleanup();
      return false;
    }

    return false;
  }
};

const scheduleReconnectAttempt = (cause: CloseEvent) => {
  if (gracePeriodStartedAt === null) return;

  const elapsed = Date.now() - gracePeriodStartedAt;

  if (elapsed >= RECONNECT_GRACE_MS) return;

  const delay =
    reconnectAttempts === 0
      ? 0
      : Math.min(1000 * 2 ** (reconnectAttempts - 1), 5000);
  reconnectAttempts++;

  console.log(`Reconnect attempt ${reconnectAttempts} in ${delay}ms`);

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;

    if (
      gracePeriodStartedAt === null ||
      Date.now() - gracePeriodStartedAt >= RECONNECT_GRACE_MS
    ) {
      return;
    }

    const success = await tryReconnect();

    if (!success && gracePeriodStartedAt !== null) {
      scheduleReconnectAttempt(cause);
    }
  }, delay);
};

const handleConnectionLost = (cause: CloseEvent) => {
  console.log('Connection lost after grace period');
  clearReconnectTimers();
  softCloseWs();

  softDisconnectFromServer({
    code: cause?.code ?? DisconnectCode.UNEXPECTED,
    reason: cause?.reason ?? '',
    wasClean: cause?.wasClean ?? false,
    time: new Date()
  });
};

const startGracePeriod = (cause: CloseEvent) => {
  if (gracePeriodStartedAt !== null) {
    return;
  }

  console.log('Starting reconnect grace period');
  gracePeriodStartedAt = Date.now();
  setServerReconnecting(true);
  playSound(SoundType.SERVER_DISCONNECTED);
  unsubscribeServerEvents();

  fullDisconnectTimer = setTimeout(() => {
    fullDisconnectTimer = null;
    handleConnectionLost(cause);
  }, RECONNECT_GRACE_MS);

  scheduleReconnectAttempt(cause);
};

const handleServerInitiatedDisconnect = (cause: CloseEvent) => {
  clearReconnectTimers();
  softCloseWs();

  softDisconnectFromServer({
    code: cause.code,
    reason: cause.reason,
    wasClean: cause.wasClean,
    time: new Date()
  });
};

const handleWsClose = (cause: CloseEvent) => {
  if (isNavigatingAway) return;

  if (isManualDisconnect) {
    isManualDisconnect = false;
    return;
  }

  if (isServerInitiatedDisconnect(cause)) {
    handleServerInitiatedDisconnect(cause);
    return;
  }

  if (isUnexpectedDisconnect(cause) || !cause.wasClean) {
    startGracePeriod(cause);
  }
};

const initializeTRPC = (host: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

  wsClient = createWSClient({
    url: `${protocol}://${host}`,
    // @ts-expect-error - the onclose type is not correct in trpc
    onClose: (cause: CloseEvent) => {
      handleWsClose(cause);
    },
    connectionParams: async (): Promise<TConnectionParams> => {
      return {
        token: getSessionStorageItem(SessionStorageKey.TOKEN) || ''
      };
    },
    keepAlive: {
      enabled: true,
      intervalMs: 30_000,
      pongTimeoutMs: 5_000
    }
  });

  trpc = createTRPCProxyClient<AppRouter>({
    links: [wsLink({ client: wsClient })]
  });

  currentHost = host;

  return trpc;
};

const connectToTRPC = (host: string) => {
  if (trpc && currentHost === host) {
    return trpc;
  }

  return initializeTRPC(host);
};

const getTRPCClient = () => {
  if (!trpc) {
    throw new Error('TRPC client is not initialized');
  }

  return trpc;
};

const cleanup = () => {
  if (isCleaningUp) {
    return;
  }

  isCleaningUp = true;
  isManualDisconnect = true;
  clearReconnectTimers();

  softCloseWs();
  currentHost = null;

  // cleanup can be called due to various reasons (manual disconnect, connection error, auto-login failure, etc).
  // so we remove any persisted auto-login token to prevent auto-login loops.
  // skip this when navigating away (refresh/close) - Firefox fires onClose during refresh, Chrome does not
  if (!isNavigatingAway) {
    removeLocalStorageItem(LocalStorageKey.AUTO_LOGIN_TOKEN);
  }

  unsubscribeServerEvents();
  resetServerScreens();
  resetServerState();
  resetDialogs();
  resetApp();

  removeSessionStorageItem(SessionStorageKey.TOKEN);

  // this should help Firefox users who report that auto login is not consistent
  setTimeout(() => {
    isCleaningUp = false;
  }, 100);
};

const retryConnection = async (): Promise<void> => {
  clearReconnectTimers();
  setDisconnectInfo(undefined);
  setServerReconnecting(true);

  const host = currentHost ?? getHostFromServer();

  softCloseWs();
  initializeTRPC(host);
  unsubscribeServerEvents();
  await connect();
  onReconnectSuccess();
  await restoreVoiceAfterReconnect();
};

export { cleanup, connectToTRPC, getTRPCClient, retryConnection, type AppRouter };
