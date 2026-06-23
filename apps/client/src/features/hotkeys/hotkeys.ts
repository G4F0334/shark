import { getVoiceControlsBridge } from '@/components/voice-provider/controls-bridge';
import { hotkeysList } from './list';

const waitForVoiceControlsBridge = () =>
  new Promise<void>((resolve) => {
    const checkBridge = () => {
      if (getVoiceControlsBridge()) {
        resolve();
        return;
      }

      setTimeout(checkBridge, 100);
    };

    checkBridge();
  });

const installRunHotkey = () => {
  const handler = async (id: string) => {
    const hotkey = hotkeysList[id as keyof typeof hotkeysList];
    const bridge = getVoiceControlsBridge();

    if (!hotkey || !bridge) return;

    await hotkey.action(bridge);
  };

  window.RunHotkey = handler;
};

void waitForVoiceControlsBridge().then(installRunHotkey);
