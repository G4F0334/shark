export const hotkeysList = {
    'voice-toggle': {
        name: 'Вкл/Выкл микрофон',
        action: async (provide: any) => {
            await provide.setMicMuted(!provide.toggleMic);
        }
    },
    'headset-toggle': {
        name: 'Вкл/Выкл гарнитуру',
        action: async (provide: any) => {
            await provide.setSoundMuted(!provide.toggleSound);
        }
    },
} as any;