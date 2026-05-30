import { Card, CardContent, CardDescription, CardHeader, CardTitle, Group, KeyBind } from '@sharkord/ui';
import { memo } from 'react';

const isElectron = window.desktop?.isElectron === true;

if (isElectron && typeof window.desktop?.reloadHotkeys === "function") {
  window.desktop?.reloadHotkeys(localStorage.getItem("hotkeys") || "").then(() => {
    console.log("Hotkeys reloaded");
  }).catch((err) => {
    console.error("Failed to reload hotkeys", err);
  });
}

const Hotkeys = memo(() => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Горячие клавиши</CardTitle>
        <CardDescription>Настройка горячих клавиш</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isElectron && (
          <Group label={"Назначения"} description={"Здесь вы можете настроить горячие клавиши для различных действий в приложении."}>
            <KeyBind id="voice-toggle" label={"Вкл/Выкл микрофон"} />
          </Group>
        ) || (
            <p>Горячие клавиши недоступны</p>
          )}
      </CardContent>
    </Card>
  );
});

export { Hotkeys };
