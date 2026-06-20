import { useVoice } from '@/features/server/voice/hooks';
import { useEffect, useMemo, useRef, useState } from 'react';

const ANALYZER_FFT_SIZE = 512;
const ANALYZER_MIN_DECIBELS = -90;
const ANALYZER_MAX_DECIBELS = -10;
const ANALYZER_SMOOTHING_TIME_CONSTANT = 0.85;
const SPEAKING_THRESHOLD = 8;

const useOwnVoiceTrayActivity = () => {
  const { localAudioStream, ownVoiceState, connectionStatus } = useVoice();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (
      !localAudioStream ||
      ownVoiceState.micMuted ||
      ownVoiceState.soundMuted
    ) {
      setIsSpeaking(false);
      return;
    }

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(localAudioStream);

      analyser.fftSize = ANALYZER_FFT_SIZE;
      analyser.minDecibels = ANALYZER_MIN_DECIBELS;
      analyser.maxDecibels = ANALYZER_MAX_DECIBELS;
      analyser.smoothingTimeConstant = ANALYZER_SMOOTHING_TIME_CONSTANT;

      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkAudioLevel = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;

        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }

        const rms = Math.sqrt(sum / dataArray.length);
        const normalizedLevel = Math.min(100, (rms / 255) * 100);

        setIsSpeaking(normalizedLevel > SPEAKING_THRESHOLD);
        timeoutRef.current = setTimeout(checkAudioLevel, 10);
      };

      checkAudioLevel();
    } catch (error) {
      console.warn('Tray voice activity detection failed:', error);
      setIsSpeaking(false);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }

      analyserRef.current = null;
      setIsSpeaking(false);
    };
  }, [localAudioStream, ownVoiceState.micMuted, ownVoiceState.soundMuted]);

  const status = useMemo(() => {
    if (connectionStatus !== 'connected') return 'inactive';
    if (ownVoiceState.micMuted) return 'micmuted';
    if (ownVoiceState.soundMuted) return 'soundmute';
    if (isSpeaking) return 'speaking';

    return 'active';
  }, [
    connectionStatus,
    ownVoiceState.micMuted,
    ownVoiceState.soundMuted,
    isSpeaking
  ]);

  useEffect(() => {
    if (window.desktop?.isElectron !== true) return;

    void window.desktop.voiceActivity?.(status);
  }, [status]);
};

export { useOwnVoiceTrayActivity };
