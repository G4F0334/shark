import { useVoiceUsersByChannelId } from '@/features/server/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import { memo } from 'react';
import { useVoiceRefs } from './hooks/use-voice-refs';

type TScreenShareUserAudioStreamProps = {
  userId: number;
};

const ScreenShareUserAudioStream = memo(
  ({ userId }: TScreenShareUserAudioStreamProps) => {
    const ownUserId = useOwnUserId();
    const { screenShareAudioRef, hasScreenShareAudioStream } =
      useVoiceRefs(userId);

    if (userId === ownUserId || !hasScreenShareAudioStream) {
      return null;
    }

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

    return (
      <>
        {voiceUsers
          .filter(
            (voiceUser) =>
              voiceUser.state.sharingScreen && voiceUser.id !== ownUserId
          )
          .map((voiceUser) => (
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
