const STORAGE_KEY = 'hotkeys';

export type THotkeyBinding = {
  id: string;
  keys: string[];
};

const MODIFIER_ALIASES: Record<string, string> = {
  Ctrl: 'Control',
  ControlLeft: 'Control',
  ControlRight: 'Control',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  MetaLeft: 'Meta',
  MetaRight: 'Meta'
};

export const normalizeHotkeyKey = (key: string): string => {
  if (MODIFIER_ALIASES[key]) return MODIFIER_ALIASES[key];

  if (key.startsWith('Key')) return key.slice(3);
  if (key.startsWith('Digit')) return key.slice(5);

  return key;
};

export const normalizeHotkeyKeys = (keys: string[]): string[] =>
  keys.map(normalizeHotkeyKey);

const migrateBindings = (parsed: unknown): THotkeyBinding[] => {
  if (Array.isArray(parsed)) {
    return parsed
      .filter(
        (item): item is THotkeyBinding =>
          !!item &&
          typeof item === 'object' &&
          'id' in item &&
          'keys' in item &&
          Array.isArray(item.keys)
      )
      .map(({ id, keys }) => ({
        id: String(id),
        keys: normalizeHotkeyKeys(keys)
      }));
  }

  if (parsed && typeof parsed === 'object') {
    return Object.entries(parsed as Record<string, string[]>).map(
      ([id, keys]) => ({
        id,
        keys: normalizeHotkeyKeys(Array.isArray(keys) ? keys : [])
      })
    );
  }

  return [];
};

let hotkeyBindingsRecord: Record<string, string[]> = {};

export const getHotkeyBindingsRecord = () => hotkeyBindingsRecord;

export const loadHotkeyBindings = (): THotkeyBinding[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    return migrateBindings(JSON.parse(raw));
  } catch {
    return [];
  }
};

export const saveHotkeyBindings = (bindings: THotkeyBinding[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
};

export const bindingsToRecord = (
  bindings: THotkeyBinding[]
): Record<string, string[]> =>
  Object.fromEntries(bindings.map(({ id, keys }) => [id, keys]));

export const refreshHotkeyBindings = (): Record<string, string[]> => {
  hotkeyBindingsRecord = bindingsToRecord(loadHotkeyBindings());
  return hotkeyBindingsRecord;
};

export const syncHotkeysToDesktop = async (
  bindings = loadHotkeyBindings()
): Promise<void> => {
  if (typeof window.desktop?.reloadHotkeys !== 'function') return;

  await window.desktop.reloadHotkeys(JSON.stringify(bindings));
};

export const updateHotkeyBinding = async (
  id: string,
  keys: string[]
): Promise<Record<string, string[]>> => {
  const normalized = normalizeHotkeyKeys(keys);
  const bindings = loadHotkeyBindings().filter((binding) => binding.id !== id);

  if (normalized.length > 0) {
    bindings.push({ id, keys: normalized });
  }

  saveHotkeyBindings(bindings);
  hotkeyBindingsRecord = bindingsToRecord(bindings);
  await syncHotkeysToDesktop(bindings);

  return hotkeyBindingsRecord;
};

export const isHotkeyBindingActive = (
  bindKeys: string[],
  pressedCodes: Iterable<string>
): boolean => {
  const pressed = new Set(
    [...pressedCodes].map((code) => normalizeHotkeyKey(code))
  );

  return bindKeys.every((key) => pressed.has(key));
};
