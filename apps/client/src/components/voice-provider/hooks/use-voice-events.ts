import { useCurrentVoiceChannelId } from '@/features/server/channels/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import { logVoice } from '@/helpers/browser-logger';
import { getTRPCClient } from '@/lib/trpc';
import type { TRemoteUserStreamKinds } from '@/types';
import { StreamKind } from '@sharkord/shared';
import type { RtpCapabilities } from 'mediasoup-client/types';
import { useEffect, useRef } from 'react';

type TEvents = {
  consume: (
    remoteId: number,
    kind: StreamKind,
    rtpCapabilities: RtpCapabilities
  ) => Promise<void>;
  removeRemoteUserStream: (
    userId: number,
    kind: TRemoteUserStreamKinds
  ) => void;
  removeExternalStreamTrack: (
    streamId: number,
    kind: StreamKind.EXTERNAL_AUDIO | StreamKind.EXTERNAL_VIDEO
  ) => void;
  removeExternalStream: (streamId: number) => void;
  clearRemoteUserStreamsForUser: (userId: number) => void;
  getRtpCapabilities: () => RtpCapabilities;
};

const useVoiceEvents = ({
  consume,
  removeRemoteUserStream,
  removeExternalStreamTrack,
  removeExternalStream,
  clearRemoteUserStreamsForUser,
  getRtpCapabilities
}: TEvents) => {
  const currentVoiceChannelId = useCurrentVoiceChannelId();
  const ownUserId = useOwnUserId();

  const consumeRef = useRef(consume);
  consumeRef.current = consume;

  const removeRemoteUserStreamRef = useRef(removeRemoteUserStream);
  removeRemoteUserStreamRef.current = removeRemoteUserStream;

  const removeExternalStreamTrackRef = useRef(removeExternalStreamTrack);
  removeExternalStreamTrackRef.current = removeExternalStreamTrack;

  const removeExternalStreamRef = useRef(removeExternalStream);
  removeExternalStreamRef.current = removeExternalStream;

  const clearRemoteUserStreamsForUserRef = useRef(clearRemoteUserStreamsForUser);
  clearRemoteUserStreamsForUserRef.current = clearRemoteUserStreamsForUser;

  const getRtpCapabilitiesRef = useRef(getRtpCapabilities);
  getRtpCapabilitiesRef.current = getRtpCapabilities;

  useEffect(() => {
    if (!currentVoiceChannelId) {
      logVoice('Voice events not initialized - missing channelId');
      return;
    }

    const trpc = getTRPCClient();

    let isCleaningUp = false;

    const scheduleRemoteAudioConsume = (remoteId: number) => {
      const rtpCapabilities = getRtpCapabilitiesRef.current();
      const retryDelaysMs = [0, 400, 1200, 3000, 6000];

      retryDelaysMs.forEach((delayMs) => {
        window.setTimeout(() => {
          if (isCleaningUp) return;

          void consumeRef.current(
            remoteId,
            StreamKind.AUDIO,
            rtpCapabilities
          );
        }, delayMs);
      });
    };

    const ensureRemoteUserMediaConsumed = (remoteId: number) => {
      const rtpCapabilities = getRtpCapabilitiesRef.current();

      scheduleRemoteAudioConsume(remoteId);

      void consumeRef.current(remoteId, StreamKind.VIDEO, rtpCapabilities);
      void consumeRef.current(remoteId, StreamKind.SCREEN, rtpCapabilities);
      void consumeRef.current(
        remoteId,
        StreamKind.SCREEN_AUDIO,
        rtpCapabilities
      );
    };

    const ensureRemoteScreenShareConsumed = (remoteId: number) => {
      const rtpCapabilities = getRtpCapabilitiesRef.current();

      void consumeRef.current(remoteId, StreamKind.SCREEN, rtpCapabilities);
      void consumeRef.current(
        remoteId,
        StreamKind.SCREEN_AUDIO,
        rtpCapabilities
      );
    };

    const onVoiceNewProducerSub = trpc.voice.onNewProducer.subscribe(
      undefined,
      {
        onData: ({ remoteId, kind, channelId }) => {
          if (currentVoiceChannelId !== channelId || isCleaningUp) return;

          if (remoteId === ownUserId) {
            logVoice('Ignoring own producer event', {
              remoteId,
              ownUserId,
              kind,
              channelId
            });

            return;
          }

          logVoice('New producer event received', {
            remoteId,
            kind,
            channelId
          });

          try {
            if (
              kind === StreamKind.SCREEN ||
              kind === StreamKind.SCREEN_AUDIO
            ) {
              ensureRemoteScreenShareConsumed(remoteId);
              return;
            }

            if (kind === StreamKind.AUDIO) {
              scheduleRemoteAudioConsume(remoteId);
              return;
            }

            void consumeRef.current(
              remoteId,
              kind,
              getRtpCapabilitiesRef.current()
            );
          } catch (error) {
            logVoice('Error consuming new producer', {
              error,
              remoteId,
              kind,
              channelId
            });
          }
        },
        onError: (error) => {
          logVoice('onVoiceNewProducer subscription error', { error });
        }
      }
    );

    const onVoiceProducerClosedSub = trpc.voice.onProducerClosed.subscribe(
      undefined,
      {
        onData: ({ channelId, remoteId, kind }) => {
          if (currentVoiceChannelId !== channelId || isCleaningUp) return;

          logVoice('Producer closed event received', {
            remoteId,
            kind,
            channelId
          });

          try {
            if (
              kind === StreamKind.EXTERNAL_VIDEO ||
              kind === StreamKind.EXTERNAL_AUDIO
            ) {
              removeExternalStreamTrackRef.current(remoteId, kind);
            } else {
              removeRemoteUserStreamRef.current(remoteId, kind);
            }
          } catch (error) {
            logVoice('Error removing remote stream for closed producer', {
              error,
              remoteId,
              kind,
              channelId
            });
          }
        },
        onError: (error) => {
          logVoice('onVoiceProducerClosed subscription error', { error });
        }
      }
    );

    const onVoiceUserLeaveSub = trpc.voice.onLeave.subscribe(undefined, {
      onData: ({ channelId, userId }) => {
        if (currentVoiceChannelId !== channelId || isCleaningUp) return;

        logVoice('User leave event received', { userId, channelId });

        try {
          clearRemoteUserStreamsForUserRef.current(userId);
        } catch (error) {
          logVoice('Error clearing remote streams for user', { error });
        }
      },
      onError: (error) => {
        logVoice('onVoiceUserLeave subscription error', { error });
      }
    });

    const onVoiceUserJoinSub = trpc.voice.onJoin.subscribe(undefined, {
      onData: ({ channelId, userId }) => {
        if (currentVoiceChannelId !== channelId || isCleaningUp) return;
        if (userId === ownUserId) return;

        logVoice('User join event received, ensuring remote media consumers', {
          userId,
          channelId
        });

        ensureRemoteUserMediaConsumed(userId);
      },
      onError: (error) => {
        logVoice('onVoiceUserJoin subscription error', { error });
      }
    });

    const onVoiceUserUpdateStateSub = trpc.voice.onUpdateState.subscribe(
      undefined,
      {
        onData: ({ channelId, userId, state }) => {
          if (currentVoiceChannelId !== channelId || isCleaningUp) return;
          if (userId === ownUserId) return;

          if (state.sharingScreen) {
            logVoice(
              'Remote user started screen share, ensuring screen consumers',
              { userId, channelId }
            );

            ensureRemoteScreenShareConsumed(userId);
          }
        },
        onError: (error) => {
          logVoice('onVoiceUpdateState subscription error', { error });
        }
      }
    );

    const onVoiceRemoveExternalStreamSub =
      trpc.voice.onRemoveExternalStream.subscribe(undefined, {
        onData: ({ channelId, streamId }) => {
          if (currentVoiceChannelId !== channelId || isCleaningUp) return;

          logVoice('External stream removed event received', {
            streamId,
            channelId
          });

          try {
            removeExternalStreamRef.current(streamId);
          } catch (error) {
            logVoice('Error removing external stream', {
              error,
              streamId,
              channelId
            });
          }
        },
        onError: (error) => {
          logVoice('onVoiceRemoveExternalStream subscription error', { error });
        }
      });

    return () => {
      logVoice('Cleaning up voice events');

      isCleaningUp = true;

      onVoiceNewProducerSub.unsubscribe();
      onVoiceProducerClosedSub.unsubscribe();
      onVoiceUserLeaveSub.unsubscribe();
      onVoiceUserJoinSub.unsubscribe();
      onVoiceUserUpdateStateSub.unsubscribe();
      onVoiceRemoveExternalStreamSub.unsubscribe();
    };
  }, [currentVoiceChannelId, ownUserId]);
};

export { useVoiceEvents };
