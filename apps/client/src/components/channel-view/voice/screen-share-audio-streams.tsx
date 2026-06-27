import { useVoiceUsersByChannelId } from '@/features/server/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import { memo, useMemo } from 'react';
import { useVoiceRefs } from './hooks/use-voice-refs';

type TScreenShareUserAudioStreamProps = {
  userId: number;
};

const ScreenShareUserAudioStream = memo(
  ({ userId }: TScreenShareUserAudioStreamProps) => {
    const { screenShareAudioRef } = useVoiceRefs(userId);

    return (
      <audio
        ref={screenShareAudioRef}
        className="hidden"
        autoPlay
        playsInline
        data-user-id={userId}
        data-stream-kind="screen-audio"
      />
    );
  }
);

type TScreenShareAudioStreamsProps = {
  channelId: number;
};

const ScreenShareAudioStreams = memo(
  ({ channelId }: TScreenShareAudioStreamsProps) => {
    const voiceUsers = useVoiceUsersByChannelId(channelId);
    const ownUserId = useOwnUserId();

    const remoteVoiceUsers = useMemo(
      () => voiceUsers.filter((voiceUser) => voiceUser.id !== ownUserId),
      [voiceUsers, ownUserId]
    );

    return (
      <>
        {remoteVoiceUsers.map((voiceUser) => (
          <ScreenShareUserAudioStream
            key={voiceUser.id}
            userId={voiceUser.id}
          />
        ))}
      </>
    );
  }
);

export { ScreenShareAudioStreams };
