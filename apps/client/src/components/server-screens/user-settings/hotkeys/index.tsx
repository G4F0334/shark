import { hotkeysList } from '@/features/hotkeys/list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Group, KeyBind } from '@sharkord/ui';
import { memo, useEffect, useRef } from 'react';

const isElectron = window.desktop?.isElectron === true;

export let hotkeys: Record<string, string[]> = {};

function HotKeyListner() {
  const bindRef = useRef<string | null>(null);
  const pressedKeysRef = useRef(new Set<string>());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      const key = e.code;
      pressedKeysRef.current.add(key);

      if (bindRef.current) return;

      for (const [id, keys] of Object.entries(hotkeys)) {
        const allPressed = keys.every(k =>
          pressedKeysRef.current.has(k)
        );

        if (allPressed) {
          bindRef.current = id;
          break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.code;

      const bindId = bindRef.current;

      pressedKeysRef.current.delete(key);

      if (!bindId) return;

      const bindKeys = hotkeys[bindId];

      if (!bindKeys) {
        bindRef.current = null;
        return;
      }

      const releasedBindKey = bindKeys.includes(key);

      if (releasedBindKey) {
        console.log("RunHotkey:", bindId);

        // Ваш вызов
        (window as any).RunHotkey?.(bindId);

        bindRef.current = null;
      }
    };

    const handleBlur = () => {
      pressedKeysRef.current.clear();
      bindRef.current = null;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  return null;
}

if (isElectron && typeof window.desktop?.reloadHotkeys === "function") {
  hotkeys = JSON.parse(localStorage.getItem("hotkeys") || "{}");
  window.desktop?.reloadHotkeys(localStorage.getItem("hotkeys") || "").then(() => {
    console.log("Hotkeys reloaded");
  }).catch((err) => {
    console.error("Failed to reload hotkeys", err);
  });
}

const Hotkeys = memo(() => {

  const handleHotkeyChange = (id: string, hotkey: string[]) => {
    hotkeys[id] = hotkey;

  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Горячие клавиши</CardTitle>
        <CardDescription>Настройка горячих клавиш</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isElectron && (
          <Group label={"Назначения"} description={"Здесь вы можете настроить горячие клавиши для различных действий в приложении."}>
            {Object.entries(hotkeysList).map(([key, hotkey]) => (
              <KeyBind
                id={key}
                label={(hotkey as any).name}
                onChange={handleHotkeyChange}
              // description={hotkey.description}
              // defaultValue={localStorage.getItem(`hotkey-${key}`) || ""}
              ></KeyBind>
            ))}
            {/* <KeyBind id="voice-toggle" label={"Вкл/Выкл микрофон"} /> */}
          </Group>
        ) || (
            <p>Горячие клавиши недоступны</p>
          )}
      </CardContent>
    </Card>
  );
});

export { Hotkeys, HotKeyListner };
