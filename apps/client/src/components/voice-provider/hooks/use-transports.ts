import { logVoice } from '@/helpers/browser-logger';
import { getTRPCClient } from '@/lib/trpc';
import type { TRemoteUserStreamKinds } from '@/types';
import {
  type ConsumerType,
  getMediasoupKind,
  StreamKind,
  type TStreamQuality,
  type TStreamQualityLayer
} from '@sharkord/shared';
import { TRPCClientError } from '@trpc/client';
import {
  type AppData,
  type Consumer,
  type Device,
  type RtpCapabilities,
  type Transport
} from 'mediasoup-client/types';
import { useCallback, useRef } from 'react';

const CONSUME_RETRY_DELAYS_MS = [0, 150, 400, 900, 2000, 4000];
const TRANSPORT_WAIT_DELAYS_MS = [0, 50, 150, 400, 1000];
const CONSUME_IN_PROGRESS_RETRY_MS = 250;

const isRetryableConsumeError = (error: unknown) => {
  if (error instanceof TRPCClientError) {
    return error.data?.code === 'NOT_FOUND';
  }

  return false;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

type TUseTransportParams = {
  addRemoteUserStream: (
    userId: number,
    stream: MediaStream,
    kind: TRemoteUserStreamKinds
  ) => void;
  removeRemoteUserStream: (
    userId: number,
    kind: TRemoteUserStreamKinds
  ) => void;
  addExternalStreamTrack: (
    streamId: number,
    stream: MediaStream,
    kind: StreamKind.EXTERNAL_AUDIO | StreamKind.EXTERNAL_VIDEO
  ) => void;
  removeExternalStreamTrack: (
    streamId: number,
    kind: StreamKind.EXTERNAL_AUDIO | StreamKind.EXTERNAL_VIDEO
  ) => void;
  setRemoteConsumerType: (
    remoteId: number,
    kind: StreamKind,
    consumerType: ConsumerType | undefined
  ) => void;
  setRemoteStreamQualityLayers: (
    remoteId: number,
    kind: StreamKind,
    layers: TStreamQualityLayer[]
  ) => void;
  clearRemoteConsumerMetadata: () => void;
  getStreamQuality: (remoteId: number, kind: StreamKind) => TStreamQuality;
  onTransportFailed?: () => void;
  hasRemoteUserStream?: (
    userId: number,
    kind: TRemoteUserStreamKinds
  ) => boolean;
};

const useTransports = ({
  addRemoteUserStream,
  removeRemoteUserStream,
  addExternalStreamTrack,
  removeExternalStreamTrack,
  setRemoteConsumerType,
  setRemoteStreamQualityLayers,
  clearRemoteConsumerMetadata,
  getStreamQuality,
  onTransportFailed,
  hasRemoteUserStream
}: TUseTransportParams) => {
  const producerTransport = useRef<Transport<AppData> | undefined>(undefined);
  const consumerTransport = useRef<Transport<AppData> | undefined>(undefined);
  const consumers = useRef<{
    [userId: number]: {
      [kind: string]: Consumer<AppData>;
    };
  }>({});
  const consumerCodecs = useRef<Map<string, string>>(new Map());
  const consumeOperationsInProgress = useRef<Set<string>>(new Set());
  const hasRemoteUserStreamRef = useRef(hasRemoteUserStream);
  hasRemoteUserStreamRef.current = hasRemoteUserStream;

  const releaseRemoteConsumer = useCallback(
    (remoteId: number, kind: StreamKind) => {
      const consumer = consumers.current[remoteId]?.[kind];

      if (consumer && !consumer.closed) {
        consumer.close();
      }

      if (consumers.current[remoteId]) {
        delete consumers.current[remoteId][kind];

        if (Object.keys(consumers.current[remoteId]).length === 0) {
          delete consumers.current[remoteId];
        }
      }

      consumeOperationsInProgress.current.delete(`${remoteId}-${kind}`);
      consumerCodecs.current.delete(`${remoteId}-${kind}`);
    },
    []
  );

  const releaseRemoteConsumersForUser = useCallback(
    (userId: number) => {
      const userConsumers = consumers.current[userId];

      if (!userConsumers) return;

      Object.keys(userConsumers).forEach((kind) => {
        releaseRemoteConsumer(userId, kind as StreamKind);
      });
    },
    [releaseRemoteConsumer]
  );

  const createProducerTransport = useCallback(async (device: Device) => {
    logVoice('Creating producer transport', { device });

    const trpc = getTRPCClient();

    try {
      const params = await trpc.voice.createProducerTransport.mutate();

      logVoice('Got producer transport parameters', { params });

      producerTransport.current = device.createSendTransport(params);

      producerTransport.current.on(
        'connect',
        async ({ dtlsParameters }, callback, errback) => {
          logVoice('Producer transport connected', { dtlsParameters });

          try {
            await trpc.voice.connectProducerTransport.mutate({
              dtlsParameters
            });

            callback();
          } catch (error) {
            errback(error as Error);
            logVoice('Error connecting producer transport', { error });
          }
        }
      );

      producerTransport.current.on('connectionstatechange', (state) => {
        logVoice('Producer transport connection state changed', { state });

        if (state === 'failed') {
          // A send transport can fail while the capture preview stays alive:
          // the browser still has the local track, but no RTP reaches people
          // watching the screen share. Rebuild the voice session just as we
          // already do for a failed receive transport.
          logVoice(`Producer transport ${state}, recovering voice session`);
          producerTransport.current?.close();
          producerTransport.current = undefined;
          onTransportFailed?.();
        } else if (state === 'closed') {
          logVoice('Producer transport closed');
          producerTransport.current = undefined;
        }
      });

      producerTransport.current.on('icecandidateerror', (error) => {
        logVoice('Producer transport ICE candidate error', { error });
      });

      producerTransport.current.on(
        'produce',
        async ({ rtpParameters, appData }, callback, errback) => {
          logVoice('Producing new track', { rtpParameters, appData });

          const { kind, qualityLayers } = appData as {
            kind: StreamKind;
            qualityLayers?: TStreamQualityLayer[];
          };

          if (!producerTransport.current) return;

          try {
            const producerId = await trpc.voice.produce.mutate({
              transportId: producerTransport.current.id,
              kind,
              rtpParameters,
              qualityLayers
            });

            callback({ id: producerId });
          } catch (error) {
            if (error instanceof TRPCClientError) {
              if (error.data.code === 'FORBIDDEN') {
                logVoice('Permission denied to produce track', { kind });
                errback(
                  new Error(
                    `You don't have permission to ${kind} in this channel`
                  )
                );

                return;
              }
            }

            logVoice('Error producing new track', { error });
            errback(error as Error);
          }
        }
      );
    } catch (error) {
      logVoice('Error creating producer transport', { error });
    }
  }, [onTransportFailed]);

  const createConsumerTransport = useCallback(
    async (device: Device) => {
      logVoice('Creating consumer transport', { device });

      const trpc = getTRPCClient();

      try {
        const params = await trpc.voice.createConsumerTransport.mutate();

        logVoice('Got consumer transport parameters', { params });

        consumerTransport.current = device.createRecvTransport(params);

        consumerTransport.current.on(
          'connect',
          async ({ dtlsParameters }, callback, errback) => {
            logVoice('Consumer transport connected', { dtlsParameters });

            try {
              await trpc.voice.connectConsumerTransport.mutate({
                dtlsParameters
              });

              callback();
            } catch (error) {
              errback(error as Error);
              logVoice('Consumer transport connect error', { error });
            }
          }
        );

        consumerTransport.current.on('connectionstatechange', (state) => {
          logVoice('Consumer transport connection state changed', { state });

          if (state === 'failed') {
            logVoice(`Consumer transport ${state}, attempting cleanup`);

            Object.values(consumers.current).forEach((userConsumers) => {
              Object.values(userConsumers).forEach((consumer) => {
                consumer.close();
              });
            });
            consumers.current = {};

            consumerTransport.current?.close();
            consumerTransport.current = undefined;
            onTransportFailed?.();
          } else if (state === 'closed') {
            logVoice('Consumer transport closed');
            consumerTransport.current = undefined;
          }
        });

        consumerTransport.current.on('icecandidateerror', (error) => {
          logVoice('Consumer transport ICE candidate error', { error });
        });
      } catch (error) {
        logVoice('Failed to create consumer transport', { error });
      }
    },
    [onTransportFailed]
  );

  const consume = useCallback(
    async (
      remoteId: number,
      kind: StreamKind,
      rtpCapabilities: RtpCapabilities
    ) => {
      for (const delayMs of TRANSPORT_WAIT_DELAYS_MS) {
        if (consumerTransport.current) {
          break;
        }

        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }

      if (!consumerTransport.current) {
        logVoice('Consumer transport not available after waiting');
        return;
      }

      const operationKey = `${remoteId}-${kind}`;
      const existingConsumer = consumers.current[remoteId]?.[kind];

      if (existingConsumer && !existingConsumer.closed) {
        if (existingConsumer.track?.readyState === 'live') {
          const hasStream = hasRemoteUserStreamRef.current;
          const missingUiStream =
            hasStream &&
            kind !== StreamKind.EXTERNAL_AUDIO &&
            kind !== StreamKind.EXTERNAL_VIDEO &&
            !hasStream(remoteId, kind as TRemoteUserStreamKinds);

          if (missingUiStream && existingConsumer.track) {
            logVoice('Re-attaching stream from live consumer', {
              remoteId,
              kind
            });

            const stream = new MediaStream();
            stream.addTrack(existingConsumer.track);

            addRemoteUserStream(
              remoteId,
              stream,
              kind as TRemoteUserStreamKinds
            );
            return;
          }

          logVoice('Live consumer already exists, skipping consume', {
            remoteId,
            kind
          });
          return;
        }

        logVoice('Closing stale consumer before consume', { remoteId, kind });
        existingConsumer.close();
        delete consumers.current[remoteId]?.[kind];
      }

      if (consumeOperationsInProgress.current.has(operationKey)) {
        logVoice('Consume operation already in progress, scheduling retry', {
          remoteId,
          kind
        });

        setTimeout(() => {
          void consume(remoteId, kind, rtpCapabilities);
        }, CONSUME_IN_PROGRESS_RETRY_MS);

        return;
      }

      consumeOperationsInProgress.current.add(operationKey);

      try {
        let lastError: unknown;

        for (
          let attempt = 0;
          attempt < CONSUME_RETRY_DELAYS_MS.length;
          attempt++
        ) {
          const retryDelayMs = CONSUME_RETRY_DELAYS_MS[attempt] ?? 0;

          if (retryDelayMs > 0) {
            await sleep(retryDelayMs);
          }

          try {
            logVoice('Consuming remote producer', {
              remoteId,
              kind,
              attempt
            });

            const trpc = getTRPCClient();

            const {
              producerId,
              consumerId,
              consumerKind,
              consumerRtpParameters,
              consumerType,
              qualityLayers
            } = await trpc.voice.consume.mutate({
              kind,
              remoteId,
              rtpCapabilities
            });

            logVoice('Got consumer parameters', {
              producerId,
              consumerId,
              consumerKind,
              consumerType,
              qualityLayers,
              consumerRtpParameters
            });

            if (!consumers.current[remoteId]) {
              consumers.current[remoteId] = {};
            }

            const existingConsumer = consumers.current[remoteId][consumerKind];

            if (existingConsumer && !existingConsumer.closed) {
              logVoice('Closing existing consumer before creating new one');

              existingConsumer.close();
              delete consumers.current[remoteId][consumerKind];
            }

            const newConsumer = await consumerTransport.current.consume({
              id: consumerId,
              producerId: producerId,
              kind: getMediasoupKind(consumerKind),
              rtpParameters: consumerRtpParameters
            });

            if (newConsumer.paused) {
              await newConsumer.resume();
            }

            logVoice('Created new consumer', { newConsumer });

            const cleanupEvents = [
              'transportclose',
              'trackended',
              '@close',
              'close'
            ];

            cleanupEvents.forEach((event) => {
              // @ts-expect-error - YOLO
              newConsumer?.on(event, () => {
                logVoice(`Consumer cleanup event "${event}" triggered`, {
                  remoteId,
                  kind
                });

                if (
                  kind === StreamKind.EXTERNAL_VIDEO ||
                  kind === StreamKind.EXTERNAL_AUDIO
                ) {
                  removeExternalStreamTrack(remoteId, kind);
                } else {
                  removeRemoteUserStream(remoteId, kind);
                }

                if (consumers.current[remoteId]?.[consumerKind]) {
                  delete consumers.current[remoteId][consumerKind];
                }

                consumerCodecs.current.delete(`${remoteId}-${kind}`);

                setRemoteConsumerType(remoteId, kind, undefined);
                setRemoteStreamQualityLayers(remoteId, kind, []);
              });
            });

            consumers.current[remoteId][consumerKind] = newConsumer;

            setRemoteConsumerType(remoteId, kind, consumerType);
            setRemoteStreamQualityLayers(remoteId, kind, qualityLayers);

            const codecKey = `${remoteId}-${kind}`;

            const negotiatedCodec =
              newConsumer.rtpParameters?.codecs?.[0]?.mimeType;

            if (negotiatedCodec) {
              consumerCodecs.current.set(codecKey, negotiatedCodec);
            }

            if (
              consumerType === 'simulcast' &&
              (kind === StreamKind.VIDEO ||
                kind === StreamKind.SCREEN ||
                kind === StreamKind.EXTERNAL_VIDEO)
            ) {
              const quality = getStreamQuality(remoteId, kind);

              if (quality.mode === 'layer') {
                await trpc.voice.setConsumerQuality.mutate({
                  remoteId,
                  kind,
                  quality
                });
              }
            }

            const stream = new MediaStream();

            stream.addTrack(newConsumer.track);

            if (
              kind === StreamKind.EXTERNAL_VIDEO ||
              kind === StreamKind.EXTERNAL_AUDIO
            ) {
              addExternalStreamTrack(remoteId, stream, kind);
            } else {
              addRemoteUserStream(remoteId, stream, kind);
            }

            return;
          } catch (error) {
            lastError = error;

            if (
              !isRetryableConsumeError(error) ||
              attempt === CONSUME_RETRY_DELAYS_MS.length - 1
            ) {
              throw error;
            }

            logVoice('Producer not ready yet, retrying consume', {
              remoteId,
              kind,
              attempt
            });
          }
        }

        throw lastError;
      } catch (error) {
        logVoice('Error consuming remote producer', { error, remoteId, kind });
      } finally {
        consumeOperationsInProgress.current.delete(operationKey);
      }
    },
    [
      addRemoteUserStream,
      removeRemoteUserStream,
      addExternalStreamTrack,
      removeExternalStreamTrack,
      setRemoteConsumerType,
      setRemoteStreamQualityLayers,
      getStreamQuality
    ]
  );

  const consumeExistingProducers = useCallback(
    async (
      rtpCapabilities: RtpCapabilities,
      externalStreamTracks?: {
        [streamId: number]: { audio?: boolean; video?: boolean };
      }
    ) => {
      logVoice('Consuming existing producers', { rtpCapabilities });

      const trpc = getTRPCClient();

      try {
        const {
          remoteAudioIds,
          remoteScreenIds,
          remoteScreenAudioIds,
          remoteVideoIds,
          remoteExternalStreamIds
        } = await trpc.voice.getProducers.query();

        logVoice('Got existing producers', {
          remoteAudioIds,
          remoteScreenIds,
          remoteVideoIds,
          remoteExternalStreamIds
        });

        const consumeOperations: Promise<void>[] = [
          ...remoteAudioIds.map((remoteId) =>
            consume(remoteId, StreamKind.AUDIO, rtpCapabilities)
          ),
          ...remoteVideoIds.map((remoteId) =>
            consume(remoteId, StreamKind.VIDEO, rtpCapabilities)
          ),
          ...remoteScreenIds.map((remoteId) =>
            consume(remoteId, StreamKind.SCREEN, rtpCapabilities)
          ),
          ...remoteScreenAudioIds.map((remoteId) =>
            consume(remoteId, StreamKind.SCREEN_AUDIO, rtpCapabilities)
          )
        ];

        remoteExternalStreamIds.forEach((streamId: number) => {
          const tracks = externalStreamTracks?.[streamId];

          if (tracks?.audio !== false) {
            consumeOperations.push(
              consume(streamId, StreamKind.EXTERNAL_AUDIO, rtpCapabilities)
            );
          }
          if (tracks?.video !== false) {
            consumeOperations.push(
              consume(streamId, StreamKind.EXTERNAL_VIDEO, rtpCapabilities)
            );
          }
        });

        await Promise.all(consumeOperations);
      } catch (error) {
        logVoice('Error consuming existing producers', { error });
      }
    },
    [consume]
  );

  const hasActiveConsumer = useCallback(
    (remoteId: number, kind: StreamKind) => {
      const consumer = consumers.current[remoteId]?.[kind];

      return (
        !!consumer && !consumer.closed && consumer.track?.readyState === 'live'
      );
    },
    []
  );

  const needsRemoteConsumer = useCallback(
    (remoteId: number, kind: StreamKind) => {
      if (!hasActiveConsumer(remoteId, kind)) {
        return true;
      }

      const hasStream = hasRemoteUserStreamRef.current;

      if (!hasStream) {
        return false;
      }

      if (
        kind === StreamKind.EXTERNAL_AUDIO ||
        kind === StreamKind.EXTERNAL_VIDEO
      ) {
        return false;
      }

      return !hasStream(remoteId, kind as TRemoteUserStreamKinds);
    },
    [hasActiveConsumer]
  );

  const syncMissingProducers = useCallback(
    async (rtpCapabilities: RtpCapabilities) => {
      if (!consumerTransport.current) return;

      const trpc = getTRPCClient();

      try {
        const {
          remoteAudioIds,
          remoteScreenIds,
          remoteScreenAudioIds,
          remoteVideoIds,
          remoteExternalStreamIds
        } = await trpc.voice.getProducers.query();

        const ensure = (remoteId: number, kind: StreamKind) => {
          if (!needsRemoteConsumer(remoteId, kind)) return;

          logVoice('Syncing missing producer consumer', { remoteId, kind });
          void consume(remoteId, kind, rtpCapabilities);
        };

        remoteAudioIds.forEach((remoteId) => {
          ensure(remoteId, StreamKind.AUDIO);
        });

        remoteVideoIds.forEach((remoteId) => {
          ensure(remoteId, StreamKind.VIDEO);
        });

        remoteScreenIds.forEach((remoteId) => {
          ensure(remoteId, StreamKind.SCREEN);
        });

        remoteScreenAudioIds.forEach((remoteId) => {
          ensure(remoteId, StreamKind.SCREEN_AUDIO);
        });

        remoteExternalStreamIds.forEach((streamId: number) => {
          ensure(streamId, StreamKind.EXTERNAL_AUDIO);
          ensure(streamId, StreamKind.EXTERNAL_VIDEO);
        });
      } catch (error) {
        logVoice('Error syncing missing producers', { error });
      }
    },
    [consume, needsRemoteConsumer]
  );

  const getConsumerCodec = useCallback(
    (remoteId: number, kind: StreamKind): string | undefined => {
      return consumerCodecs.current.get(`${remoteId}-${kind}`);
    },
    []
  );

  const cleanupTransports = useCallback(() => {
    logVoice('Cleaning up transports');

    Object.values(consumers.current).forEach((userConsumers) => {
      Object.values(userConsumers).forEach((consumer) => {
        if (!consumer.closed) {
          consumer.close();
        }
      });
    });

    consumers.current = {};
    consumerCodecs.current.clear();

    clearRemoteConsumerMetadata();

    consumeOperationsInProgress.current.clear();

    if (producerTransport.current && !producerTransport.current.closed) {
      producerTransport.current.close();
    }

    producerTransport.current = undefined;

    if (consumerTransport.current && !consumerTransport.current.closed) {
      consumerTransport.current.close();
    }

    consumerTransport.current = undefined;

    logVoice('Transports cleanup complete');
  }, [clearRemoteConsumerMetadata]);

  return {
    producerTransport,
    consumerTransport,
    consumers,
    createProducerTransport,
    createConsumerTransport,
    consume,
    consumeExistingProducers,
    syncMissingProducers,
    releaseRemoteConsumer,
    releaseRemoteConsumersForUser,
    cleanupTransports,
    getConsumerCodec
  };
};

export { useTransports };
