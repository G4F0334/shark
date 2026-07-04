type THotkeyProvider = {
  setMicMuted: (muted: boolean) => Promise<void>;
  setSoundMuted: (muted: boolean) => Promise<void>;
  toggleMic: boolean;
  toggleSound: boolean;
};

type THotkey = {
  name: string;
  action: (provide: THotkeyProvider) => Promise<void>;
};

export const hotkeysList = {
  'voice-toggle': {
    name: 'Вкл/Выкл микрофон',
    action: async (provide) => {
      await provide.setMicMuted(!provide.toggleMic);
    }
  },
  'headset-toggle': {
    name: 'Вкл/Выкл гарнитуру',
    action: async (provide) => {
      await provide.setSoundMuted(!provide.toggleSound);
    }
  }
} satisfies Record<string, THotkey>;
