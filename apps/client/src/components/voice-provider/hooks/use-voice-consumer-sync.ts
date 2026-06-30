import { logVoice } from '@/helpers/browser-logger';
import type { RtpCapabilities } from 'mediasoup-client/types';
import { useEffect, useRef } from 'react';
import { ConnectionStatus } from '../index';

const SYNC_INTERVAL_MS = 20_000;
const INITIAL_SYNC_DELAY_MS = 2_000;

type TUseVoiceConsumerSyncParams = {
  connectionStatus: ConnectionStatus;
  syncMissingProducers: (rtpCapabilities: RtpCapabilities) => Promise<void>;
  getRtpCapabilities: () => RtpCapabilities;
};

const useVoiceConsumerSync = ({
  connectionStatus,
  syncMissingProducers,
  getRtpCapabilities
}: TUseVoiceConsumerSyncParams) => {
  const syncMissingProducersRef = useRef(syncMissingProducers);
  syncMissingProducersRef.current = syncMissingProducers;

  const getRtpCapabilitiesRef = useRef(getRtpCapabilities);
  getRtpCapabilitiesRef.current = getRtpCapabilities;

  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;

    let cancelled = false;

    const runSync = () => {
      if (cancelled) return;

      logVoice('Running periodic voice consumer sync');

      void syncMissingProducersRef.current(getRtpCapabilitiesRef.current());
    };

    const initialTimer = window.setTimeout(runSync, INITIAL_SYNC_DELAY_MS);
    const intervalId = window.setInterval(runSync, SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
    };
  }, [connectionStatus]);
};

export { useVoiceConsumerSync };
