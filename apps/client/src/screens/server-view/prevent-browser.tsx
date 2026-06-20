import { useCurrentVoiceChannelId } from '@/features/server/channels/hooks';
import { usePreventExit } from '@/hooks/use-prevent-exit';
import { memo } from 'react';

const PreventBrowser = memo(() => {
  const currentVoiceChannelId = useCurrentVoiceChannelId();
  const isElectron = window.desktop?.isElectron === true;

  // Desktop hides to tray on close and has an explicit tray Quit action.
  usePreventExit(!!currentVoiceChannelId && !isElectron);

  return null;
});

export { PreventBrowser };
