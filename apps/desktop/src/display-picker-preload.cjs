const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  displayMediaPicker: {
    listSources: () => ipcRenderer.invoke('desktop:display-media:list-sources'),
    submit: (payload) =>
      ipcRenderer.invoke('desktop:display-media:submit', payload),
    cancel: () => ipcRenderer.invoke('desktop:display-media:cancel'),
    reset: () => ipcRenderer.invoke('desktop:display-media:reset')
  }
});
