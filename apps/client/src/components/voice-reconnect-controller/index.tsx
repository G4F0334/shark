import { setVoiceReconnectHandler } from '@/features/server/actions';
import { useVoice } from '@/features/server/voice/hooks';
import { memo, useEffect } from 'react';

const VoiceReconnectController = memo(() => {
  const { init } = useVoice();

  useEffect(() => {
    setVoiceReconnectHandler(async (rtpCapabilities, channelId) => {
      await init(rtpCapabilities, channelId);
    });

    return () => {
      setVoiceReconnectHandler(null);
    };
  }, [init]);

  return null;
});

export { VoiceReconnectController };
