const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  applicationLoopbackStop: () =>
    ipcRenderer.invoke('desktop:application-loopback-stop'),
  displayMediaPicker: {
    listSources: () => ipcRenderer.invoke('desktop:display-media:list-sources'),
    submit: (payload) =>
      ipcRenderer.invoke('desktop:display-media:submit', payload),
    cancel: () => ipcRenderer.invoke('desktop:display-media:cancel')
  }
});
