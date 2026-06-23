import { Dialog } from '@/components/dialogs/dialogs';
import { logDebug } from '@/helpers/browser-logger';
import { getHostFromServer } from '@/helpers/get-file-url';
import { cleanup, connectToTRPC, getTRPCClient, retryConnection } from '@/lib/trpc';
import type { TMessageJumpToTarget } from '@/types';
import { type TPublicServerSettings, type TServerInfo } from '@sharkord/shared';
import type { RtpCapabilities } from 'mediasoup-client/types';
import { toast } from 'sonner';
import { appSliceActions } from '../app/slice';
import { openDialog } from '../dialogs/actions';
import { store } from '../store';
import {
  channelReadStateByIdSelector,
  currentVoiceChannelIdSelector,
  isChannelTextVisibleByIdSelector
} from './channels/selectors';
import {
  processPluginComponents,
  setPluginCommands,
  setPluginComponents
} from './plugins/actions';
import { infoSelector } from './selectors';
import { serverSliceActions } from './slice';
import { type TDisconnectInfo } from './types';
import { returnJoinVoice } from './voice/actions';

let unsubscribeFromServer: (() => void) | null = null;

type TVoiceReconnectHandler = (
  rtpCapabilities: RtpCapabilities,
  channelId: number
) => Promise<void>;

let voiceReconnectHandler: TVoiceReconnectHandler | null = null;

export const setConnected = (status: boolean) => {
  store.dispatch(serverSliceActions.setConnected(status));
};

export const resetServerState = () => {
  store.dispatch(serverSliceActions.resetState());
};

export const setDisconnectInfo = (info: TDisconnectInfo | undefined) => {
  store.dispatch(serverSliceActions.setDisconnectInfo(info));
};

export const unsubscribeServerEvents = () => {
  unsubscribeFromServer?.();
  unsubscribeFromServer = null;
};

export const softDisconnectFromServer = (info: TDisconnectInfo) => {
  unsubscribeServerEvents();
  setServerReconnecting(false);
  store.dispatch(serverSliceActions.setConnected(false));
  store.dispatch(serverSliceActions.setDisconnectInfo(info));
};

export const onReconnectSuccess = () => {
  setDisconnectInfo(undefined);
  setServerReconnecting(false);
};

export const setVoiceReconnectHandler = (
  handler: TVoiceReconnectHandler | null
) => {
  voiceReconnectHandler = handler;

  if (handler) {
    void runPendingVoiceReconnect();
  }
};

let pendingVoiceReconnect = false;

export const restoreVoiceAfterReconnect = async (): Promise<void> => {
  pendingVoiceReconnect = true;
  await runPendingVoiceReconnect();
};

const runPendingVoiceReconnect = async (): Promise<void> => {
  if (!pendingVoiceReconnect || !voiceReconnectHandler) return;

  pendingVoiceReconnect = false;

  const rtpCapabilities = await returnJoinVoice();

  if (!rtpCapabilities) return;

  const channelId = currentVoiceChannelIdSelector(store.getState());

  if (!channelId) return;

  await voiceReconnectHandler(rtpCapabilities, channelId);
};

export const retryServerConnection = async (): Promise<void> => {
  try {
    await retryConnection();
  } catch (error) {
    setServerReconnecting(false);

    const message =
      error instanceof Error ? error.message : 'Failed to reconnect';

    toast.error(message);
    throw error;
  }
};

export const setConnecting = (status: boolean) => {
  store.dispatch(serverSliceActions.setConnecting(status));
};

export const setServerReconnecting = (status: boolean) => {
  store.dispatch(serverSliceActions.setServerReconnecting(status));
};

export const setServerId = (id: string) => {
  store.dispatch(serverSliceActions.setServerId(id));
};

export const setDmsOpen = (open: boolean) => {
  store.dispatch(serverSliceActions.setDmsOpen(open));
};

export const setPublicServerSettings = (
  settings: TPublicServerSettings | undefined
) => {
  store.dispatch(serverSliceActions.setPublicSettings(settings));
};

export const setInfo = (info: TServerInfo | undefined) => {
  store.dispatch(serverSliceActions.setInfo(info));
};

export const setActiveFullscreenPluginId = (pluginId: string | undefined) => {
  store.dispatch(serverSliceActions.setActiveFullscreenPluginId(pluginId));
};

export const connect = async () => {
  const state = store.getState();
  const info = infoSelector(state);

  if (!info) {
    throw new Error('Failed to fetch server info');
  }

  const { serverId } = info;

  const host = getHostFromServer();
  const trpc = await connectToTRPC(host);

  const { hasPassword, handshakeHash } = await trpc.others.handshake.query();

  if (hasPassword) {
    // show password prompt
    openDialog(Dialog.SERVER_PASSWORD, { handshakeHash, serverId });
    return;
  }

  const { showWelcomeDialog } = await joinServer(handshakeHash);

  if (showWelcomeDialog) {
    openDialog(Dialog.WELCOME_PROFILE_SETUP);
  }
};

export const joinServer = async (handshakeHash: string, password?: string) => {
  const trpc = getTRPCClient();
  const data = await trpc.others.joinServer.query({ handshakeHash, password });

  logDebug('joinServer', data);

  const { initSubscriptions } = await import('./subscriptions');

  unsubscribeFromServer = initSubscriptions();

  store.dispatch(serverSliceActions.setInitialData(data));

  setPluginCommands(data.commands);

  const components = await processPluginComponents(
    data.pluginIdsWithComponents
  );

  setPluginComponents(components);

  return {
    showWelcomeDialog: data.showWelcomeDialog
  };
};

export const disconnectFromServer = () => {
  cleanup();
};

export const jumpToMessage = (target: TMessageJumpToTarget) => {
  store.dispatch(appSliceActions.setMessageJumpTarget(target));

  if (target.isDm) {
    setDmsOpen(true);
    store.dispatch(appSliceActions.setSelectedDmChannelId(target.channelId));

    return;
  }

  setDmsOpen(false);
  store.dispatch(appSliceActions.setSelectedDmChannelId(undefined));
  store.dispatch(serverSliceActions.setSelectedChannelId(target.channelId));

  const state = store.getState();

  if (isChannelTextVisibleByIdSelector(state, target.channelId)) {
    markChannelAsRead(target.channelId);
  }
};

export const markChannelAsRead = (
  channelId: number,
  force: boolean = false
) => {
  const state = store.getState();
  const unreadCount = channelReadStateByIdSelector(state, channelId);

  if (!force && unreadCount === 0) {
    return;
  }

  if (unreadCount > 0) {
    store.dispatch(
      serverSliceActions.setChannelReadState({ channelId, count: 0 })
    );
  }

  const trpc = getTRPCClient();

  try {
    trpc.channels.markAsRead.mutate({ channelId });
  } catch {
    // ignore errors
  }
};

window.useToken = async (token: string) => {
  const trpc = getTRPCClient();

  try {
    await trpc.others.useSecretToken.mutate({ token });

    toast.success('You are now an owner of this server');
  } catch {
    toast.error('Invalid access token');
  }
};

window.openSoundsModal = () => {
  openDialog(Dialog.SOUNDS);
};
