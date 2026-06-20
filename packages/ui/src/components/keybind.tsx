import { useEffect, useRef, useState } from 'react';

type TKeyBindProps = {
  id: string;
  label: string;
  className?: string;
  current?: string[];
  onChange?: (id: string, keys: string[]) => void | Promise<void>;
  onRecordingChange?: (recording: boolean) => void;
};

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight'
]);

const normalizeCode = (code: string) => {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
};

const buildKeysFromEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
  const keys: string[] = [];

  if (e.ctrlKey) keys.push('Control');
  if (e.shiftKey) keys.push('Shift');
  if (e.altKey) keys.push('Alt');
  if (e.metaKey) keys.push('Meta');

  if (!MODIFIER_CODES.has(e.code)) {
    keys.push(normalizeCode(e.code));
  }

  return keys;
};

function KeyBind({ id, label, current, onChange, onRecordingChange }: TKeyBindProps) {
  const [recording, setRecording] = useState(false);
  const [hotkey, setHotkey] = useState<string[]>(current ?? []);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingKeysRef = useRef<string[]>(current ?? []);

  useEffect(() => {
    const keys = current ?? [];
    pendingKeysRef.current = keys;
    setHotkey(keys);
  }, [current, id]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const keys = buildKeysFromEvent(e);
    pendingKeysRef.current = keys;
    setHotkey(keys);
  };

  const handleKeyUp = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();

    if (MODIFIER_CODES.has(e.code)) return;

    const keys = pendingKeysRef.current;
    if (keys.length === 0) return;

    await onChange?.(id, keys);

    inputRef.current?.blur();
  };

  return (
    <div
      data-slot="keybind"
      className="bg-keybind text-keybind-foreground flex flex-col gap-6 rounded-xl border py-4 shadow-sm"
    >
      <div className="flex items-center justify-between px-6">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            id={`keybind-${id}`}
            readOnly
            value={
              recording
                ? 'Нажмите комбинацию...'
                : hotkey.join('+') || 'Не назначено'
            }
            onFocus={() => {
              setRecording(true);
              onRecordingChange?.(true);
            }}
            onBlur={() => {
              setRecording(false);
              onRecordingChange?.(false);
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            style={{
              width: 250,
              padding: 8,
              border: '1px solid #555',
              borderRadius: 6
            }}
          />
        </div>
      </div>
    </div>
  );
}

export { KeyBind };
