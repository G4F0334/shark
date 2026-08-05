import type { TPinnedCard } from '@/components/channel-view/voice/hooks/use-pin-card-controller';
import { store } from '@/features/store';
import { logVoice } from '@/helpers/browser-logger';
import {
  LocalStorageKey,
  setLocalStorageItem,
  setLocalStorageItemBool
} from '@/helpers/storage';
import { getTRPCClient } from '@/lib/trpc';
import { notifyVoiceSignalingRefresh } from '@/lib/voice-signaling-refresh';
import {
  getTrpcError,
  type TExternalStream,
  type TVoiceUserState
} from '@sharkord/shared';
import type { RtpCapabilities } from 'mediasoup-client/types';
import { toast } from 'sonner';
import {
  setCurrentVoiceChannelId,
  setSelectedChannelId
} from '../channels/actions';
import {
  currentVoiceChannelIdSelector,
  selectedChannelIdSelector
} from '../channels/selectors';
import { serverSliceActions } from '../slice';
import { playSound } from '../sounds/actions';
import { SoundType } from '../types';
import { ownUserIdSelector } from '../users/selectors';
import { ownVoiceStateSelector } from './selectors';

export const addUserToVoiceChannel = (
  userId: number,
  channelId: number,
  voiceState: TVoiceUserState
): void => {
  const state = store.getState();
  const ownUserId = ownUserIdSelector(state);
  const currentChannelId = currentVoiceChannelIdSelector(state);

  store.dispatch(
    serverSliceActions.addUserToVoiceChannel({
      userId,
      channelId,
      state: voiceState
    })
  );

  if (userId !== ownUserId && channelId === currentChannelId) {
    playSound(SoundType.REMOTE_USER_JOINED_VOICE_CHANNEL);
  }
};

export const removeUserFromVoiceChannel = (
  userId: number,
  channelId: number
): void => {
  const state = store.getState();
  const ownUserId = ownUserIdSelector(state);
  const currentChannelId = currentVoiceChannelIdSelector(state);

  store.dispatch(
    serverSliceActions.removeUserFromVoiceChannel({ userId, channelId })
  );

  // The server is authoritative. A user can be removed from a voice channel
  // by a disconnect or an administrative action without clicking the local
  // leave button. Clear the local channel selection as well; the provider
  // then releases WebRTC/media resources via its normal channel-change hook.
  if (userId === ownUserId && channelId === currentChannelId) {
    if (selectedChannelIdSelector(state) === channelId) {
      setSelectedChannelId(undefined);
    }

    setCurrentVoiceChannelId(undefined);
    updateOwnVoiceState({ webcamEnabled: false, sharingScreen: false });
    setPinnedCard(undefined);
    notifyVoiceSignalingRefresh();
    return;
  }

  if (userId !== ownUserId && channelId === currentChannelId) {
    playSound(SoundType.REMOTE_USER_LEFT_VOICE_CHANNEL);
  }
};

export const addExternalStreamToVoiceChannel = (
  channelId: number,
  streamId: number,
  stream: TExternalStream
): void => {
  store.dispatch(
    serverSliceActions.addExternalStreamToChannel({
      channelId,
      streamId,
      stream
    })
  );
};

export const updateExternalStreamInVoiceChannel = (
  channelId: number,
  streamId: number,
  stream: TExternalStream
): void => {
  store.dispatch(
    serverSliceActions.updateExternalStreamInChannel({
      channelId,
      streamId,
      stream
    })
  );
};

export const removeExternalStreamFromVoiceChannel = (
  channelId: number,
  streamId: number
): void => {
  store.dispatch(
    serverSliceActions.removeExternalStreamFromChannel({
      channelId,
      streamId
    })
  );
};

export const updateVoiceUserState = (
  userId: number,
  channelId: number,
  newState: Partial<TVoiceUserState>
): void => {
  const state = store.getState();
  const ownUserId = ownUserIdSelector(state);
  const currentChannelId = currentVoiceChannelIdSelector(state);

  if (userId !== ownUserId && channelId === currentChannelId) {
    const currentUserState = state.server.voiceMap[channelId]?.users[userId];

    if (newState.sharingScreen === true && !currentUserState?.sharingScreen) {
      playSound(SoundType.REMOTE_USER_STARTED_SCREENSHARE);
    } else if (
      newState.sharingScreen === false &&
      currentUserState?.sharingScreen
    ) {
      playSound(SoundType.REMOTE_USER_STOPPED_SCREENSHARE);
    }
  }

  store.dispatch(
    serverSliceActions.updateVoiceUserState({ userId, channelId, newState })
  );
};

export const updateOwnVoiceState = (
  newState: Partial<TVoiceUserState>
): void => {
  store.dispatch(serverSliceActions.updateOwnVoiceState(newState));
};

export const returnJoinVoice = async (): Promise<RtpCapabilities | undefined> => {
  const state = store.getState();
  const channelId = currentVoiceChannelIdSelector(state);

  if (!channelId) {
    logVoice('Return join voice requested without active channel');
    return undefined;
  }

  const { micMuted, soundMuted } = ownVoiceStateSelector(state);
  const client = getTRPCClient();

  try {
    const { routerRtpCapabilities } = await client.voice.join.mutate({
      channelId,
      state: { micMuted, soundMuted }
    });

    // The store is updated before the join mutation so that the voice UI can
    // render immediately. Refresh channel-scoped subscriptions now that the
    // WebSocket context has the joined channel; otherwise they can remain
    // subscribed to the pre-join (empty) channel scope.
    notifyVoiceSignalingRefresh();

    return routerRtpCapabilities;
  } catch (error) {
    toast.error(getTrpcError(error, 'Failed to return join voice channel'));
  }

  return undefined;
};

export const joinVoice = async (
  channelId: number
): Promise<RtpCapabilities | undefined> => {
  const state = store.getState();
  const currentChannelId = currentVoiceChannelIdSelector(state);

  if (channelId === currentChannelId) {
    // already in the desired channel
    return undefined;
  }

  if (currentChannelId) {
    // is already in a voice channel, leave it first
    await leaveVoice({ reason: 'switch_channel' });
  }

  setCurrentVoiceChannelId(channelId);

  const { micMuted, soundMuted } = ownVoiceStateSelector(state);
  const client = getTRPCClient();

  try {
    const { routerRtpCapabilities } = await client.voice.join.mutate({
      channelId,
      state: { micMuted, soundMuted }
    });

    // setCurrentVoiceChannelId() runs before the request so the UI can render
    // immediately. Recreate channel-scoped subscriptions only after the
    // WebSocket context has completed the server-side join.
    notifyVoiceSignalingRefresh();

    return routerRtpCapabilities;
  } catch (error) {
    toast.error(getTrpcError(error, 'Failed to join voice channel'));
  }

  return undefined;
};

export type TLeaveVoiceReason =
  | 'user_disconnect_button'
  | 'switch_channel'
  | 'unknown';

export const leaveVoice = async (options?: {
  reason?: TLeaveVoiceReason;
}): Promise<void> => {
  const state = store.getState();
  const currentChannelId = currentVoiceChannelIdSelector(state);
  const selectedChannelId = selectedChannelIdSelector(state);
  const reason = options?.reason ?? 'unknown';

  if (!currentChannelId) {
    logVoice('Leave voice requested without active channel', { reason });
    return;
  }

  logVoice('Leave voice requested', {
    reason,
    channelId: currentChannelId,
    selectedChannelId
  });

  if (selectedChannelId === currentChannelId) {
    setSelectedChannelId(undefined);
  }

  setCurrentVoiceChannelId(undefined);
  updateOwnVoiceState({ webcamEnabled: false, sharingScreen: false });
  setPinnedCard(undefined);

  const client = getTRPCClient();

  try {
    await client.voice.leave.mutate();
    playSound(SoundType.OWN_USER_LEFT_VOICE_CHANNEL);
  } catch (error) {
    toast.error(getTrpcError(error, 'Failed to leave voice channel'));
  }
};

export const setPinnedCard = (pinnedCard: TPinnedCard | undefined): void => {
  store.dispatch(serverSliceActions.setPinnedCard(pinnedCard));
};

export const setHideNonVideoParticipants = (value: boolean): void => {
  store.dispatch(serverSliceActions.setHideNonVideoParticipants(value));

  try {
    setLocalStorageItem(
      LocalStorageKey.HIDE_NON_VIDEO_PARTICIPANTS,
      String(value)
    );
  } catch (error) {
    console.error('Failed to save voice options:', error);
  }
};

export const setShowUserBannersInVoice = (value: boolean): void => {
  store.dispatch(serverSliceActions.setShowUserBannersInVoice(value));

  try {
    setLocalStorageItemBool(
      LocalStorageKey.VOICE_CHAT_SHOW_USER_BANNERS,
      value
    );
  } catch (error) {
    console.error('Failed to save voice options:', error);
  }
};

export const setHideOwnScreenShare = (value: boolean): void => {
  store.dispatch(serverSliceActions.setHideOwnScreenShare(value));

  try {
    setLocalStorageItemBool(LocalStorageKey.HIDE_OWN_SCREEN_SHARE, value);
  } catch (error) {
    console.error('Failed to save voice options:', error);
  }
};
