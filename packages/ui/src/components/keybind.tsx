import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

type TKeyBindProps = {
    id: string;
    label: string;
    className?: string;
    current?: string[];
    onChange?: (id: string, keys: string[]) => void;
};

const normalizeCode = (code: string) => {
    if (code.startsWith("Key")) {
        return code.slice(3);
    }

    if (code.startsWith("Digit")) {
        return code.slice(5);
    }

    return code;
};

function KeyBind({ id, label, current, onChange }: TKeyBindProps) {
    const [recording, setRecording] = useState(false);
    const [hotkey, setHotkey] = useState([] as string[]);

    useEffect(() => {
        const keys = current || [];

        console.log("Loaded hotkeys", keys);

        if (keys) {
            console.log(keys)
            setHotkey(keys);
        }
    }, [id]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        e.preventDefault();

        const keys: string[] = [];

        if (e.ctrlKey) keys.push("Ctrl");
        if (e.shiftKey) keys.push("Shift");
        if (e.altKey) keys.push("Alt");
        if (e.metaKey) keys.push("Meta");

        const ignored = [
            "Control",
            "Shift",
            "Alt",
            "Meta",
        ];

        const include = ignored.some(k => {
            if (e.code.startsWith(k)) {
                return true;
            }
            return false;
        })

        if (!include) {
            keys.push(normalizeCode(e.code));
        }

        const combo = keys.join("+");

        setHotkey(keys);
    };

    const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
        

        if ((window as any).desktop && typeof (window as any).desktop?.changeHotkey === "function") {
            (window as any).desktop?.changeHotkey({
                id,
                keys: hotkey,
            });
        }

        onChange?.(id, hotkey);
        e.currentTarget.blur();
    };

    return (
        <div
            data-slot="keybind"
            className={'bg-keybind text-keybind-foreground flex flex-col gap-6 rounded-xl border py-4 shadow-sm'}
        >
            <div className="flex items-center justify-between px-6">
                <span className="text-sm font-medium">{label}</span>
                <div className="flex items-center gap-2">
                    <input
                        id={`keybind-${id}`}
                        readOnly
                        value={recording ? "Нажмите комбинацию..." : hotkey.join("+") || "Не назначено"}
                        onFocus={() => setRecording(true)}
                        onBlur={() => setRecording(false)}
                        onKeyDown={handleKeyDown}
                        onKeyUp={handleKeyUp}
                        style={{
                            width: 250,
                            padding: 8,
                            border: "1px solid #555",
                            borderRadius: 6,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

export { KeyBind };