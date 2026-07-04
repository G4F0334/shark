const VOICE_SIGNALING_REFRESH_EVENT = 'sharkord:voice-signaling-refresh';

let voiceSignalingRefreshVersion = 0;

const notifyVoiceSignalingRefresh = () => {
  voiceSignalingRefreshVersion += 1;
  window.dispatchEvent(
    new CustomEvent(VOICE_SIGNALING_REFRESH_EVENT, {
      detail: voiceSignalingRefreshVersion
    })
  );
};

const getVoiceSignalingRefreshVersion = () => voiceSignalingRefreshVersion;

const subscribeVoiceSignalingRefresh = (
  listener: (version: number) => void
) => {
  const handler = (event: Event) => {
    listener((event as CustomEvent<number>).detail);
  };

  window.addEventListener(VOICE_SIGNALING_REFRESH_EVENT, handler);

  return () => {
    window.removeEventListener(VOICE_SIGNALING_REFRESH_EVENT, handler);
  };
};

export {
  getVoiceSignalingRefreshVersion,
  notifyVoiceSignalingRefresh,
  subscribeVoiceSignalingRefresh
};
