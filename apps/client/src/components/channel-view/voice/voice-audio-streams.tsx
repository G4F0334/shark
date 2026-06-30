import { useVoiceUsersByChannelId } from '@/features/server/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import { memo, useMemo } from 'react';
import { useVoiceRefs } from './hooks/use-voice-refs';

type TVoiceUserAudioStreamProps = {
  userId: number;
};

const VoiceUserAudioStream = memo(({ userId }: TVoiceUserAudioStreamProps) => {
  const { audioRef } = useVoiceRefs(userId);

  return (
    <audio
      ref={audioRef}
      className="hidden"
      autoPlay
      playsInline
      data-user-id={userId}
      data-stream-kind="voice"
    />
  );
});

type TVoiceAudioStreamsProps = {
  channelId: number;
};

const VoiceAudioStreams = memo(({ channelId }: TVoiceAudioStreamsProps) => {
  const voiceUsers = useVoiceUsersByChannelId(channelId);
  const ownUserId = useOwnUserId();

  const remoteVoiceUsers = useMemo(
    () => voiceUsers.filter((voiceUser) => voiceUser.id !== ownUserId),
    [voiceUsers, ownUserId]
  );

  return (
    <>
      {remoteVoiceUsers.map((voiceUser) => (
        <VoiceUserAudioStream key={voiceUser.id} userId={voiceUser.id} />
      ))}
    </>
  );
});

export { VoiceAudioStreams };
