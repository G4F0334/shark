export const installElectronLocalStorageBridge = async (): Promise<void> => {
  const storage = window.desktop?.storage;

  if (!storage) return;

  const persisted = await storage.readAll();

  for (const [key, value] of Object.entries(persisted)) {
    if (typeof value !== 'string') continue;

    localStorage.setItem(key, value);
  }

  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalRemoveItem = localStorage.removeItem.bind(localStorage);
  const originalClear = localStorage.clear.bind(localStorage);

  localStorage.setItem = (key: string, value: string) => {
    originalSetItem(key, value);
    void storage.setItem(key, value);
  };

  localStorage.removeItem = (key: string) => {
    originalRemoveItem(key);
    void storage.removeItem(key);
  };

  localStorage.clear = () => {
    originalClear();

    void storage.readAll().then((data) => {
      for (const key of Object.keys(data)) {
        void storage.removeItem(key);
      }
    });
  };
};
