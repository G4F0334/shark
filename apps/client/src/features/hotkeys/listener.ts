import {
  getHotkeyBindingsRecord,
  isHotkeyBindingActive,
  normalizeHotkeyKey,
  refreshHotkeyBindings,
  syncHotkeysToDesktop
} from './storage';

let started = false;
let suspended = false;
const pressedKeys = new Set<string>();
let bindId: string | null = null;

const resetHotkeyState = () => {
  pressedKeys.clear();
  bindId = null;
};

export const setHotkeysSuspended = (value: boolean): void => {
  suspended = value;

  if (value) {
    resetHotkeyState();
  }
};

export const startHotkeyListener = (): void => {
  if (started) return;
  started = true;

  refreshHotkeyBindings();

  if (window.desktop?.isElectron === true) {
    void syncHotkeysToDesktop();
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || suspended) return;

    pressedKeys.add(e.code);

    if (bindId) return;

    for (const [id, keys] of Object.entries(getHotkeyBindingsRecord())) {
      if (isHotkeyBindingActive(keys, pressedKeys)) {
        bindId = id;
        break;
      }
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (suspended) {
      resetHotkeyState();
      return;
    }

    const currentBindId = bindId;
    const key = e.code;

    pressedKeys.delete(key);

    if (!currentBindId) return;

    const bindKeys = getHotkeyBindingsRecord()[currentBindId];

    if (!bindKeys) {
      bindId = null;
      return;
    }

    if (bindKeys.includes(normalizeHotkeyKey(key))) {
      void window.RunHotkey?.(currentBindId);
      bindId = null;
    }
  };

  const handleBlur = () => {
    resetHotkeyState();
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleBlur);
};
