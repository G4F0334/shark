import { getVoiceControlsBridge } from "@/components/voice-provider/controls-bridge";
import { hotkeysList } from "./list";

const waitForVoiceControlsBridge = () => {
    return new Promise((resolve: any) => {
        const checkBridge = () => {
            const bridge = getVoiceControlsBridge();
            if (bridge) {
                resolve();
            } else {
                setTimeout(checkBridge, 100);
            }
        };
        checkBridge();
    })
};

waitForVoiceControlsBridge().then(() => {
    let provide = getVoiceControlsBridge();
    if (provide) {
        (globalThis as any).RunHotkey = async (keys: string) => {
            const hotkey = hotkeysList[keys];
            if (hotkey) {
                await hotkey.action(provide);
                provide = await getVoiceControlsBridge();
            }
        };
    }
});

