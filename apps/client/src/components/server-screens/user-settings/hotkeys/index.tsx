import { setHotkeysSuspended } from '@/features/hotkeys/listener';
import {
  refreshHotkeyBindings,
  syncHotkeysToDesktop,
  updateHotkeyBinding
} from '@/features/hotkeys/storage';
import { hotkeysList } from '@/features/hotkeys/list';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Group,
  KeyBind
} from '@sharkord/ui';
import { memo, useCallback, useState } from 'react';

const isElectron = window.desktop?.isElectron === true;

if (isElectron) {
  refreshHotkeyBindings();
  void syncHotkeysToDesktop();
}

const Hotkeys = memo(() => {
  const [bindings, setBindings] = useState(() => refreshHotkeyBindings());

  const handleHotkeyChange = useCallback(async (id: string, hotkey: string[]) => {
    const nextBindings = await updateHotkeyBinding(id, hotkey);
    setBindings({ ...nextBindings });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Горячие клавиши</CardTitle>
        <CardDescription>Настройка горячих клавиш</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isElectron ? (
          <Group
            label="Назначения"
            description="Здесь вы можете настроить горячие клавиши для различных действий в приложении."
          >
            {Object.entries(hotkeysList).map(([key, hotkey]) => (
              <KeyBind
                key={key}
                id={key}
                label={(hotkey as { name: string }).name}
                current={bindings[key]}
                onChange={handleHotkeyChange}
                onRecordingChange={setHotkeysSuspended}
              />
            ))}
          </Group>
        ) : (
          <p>Горячие клавиши недоступны</p>
        )}
      </CardContent>
    </Card>
  );
});

export { Hotkeys };
