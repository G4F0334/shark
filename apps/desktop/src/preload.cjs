const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  isElectron: true,
  voiceActivity: (status) => ipcRenderer.invoke('desktop:voice-activity', status),
  reloadHotkeys: (keys) => ipcRenderer.invoke('desktop:reload-hotkeys', keys),
  changeHotkey: (newHotkey) => ipcRenderer.invoke('desktop:change-hotkey', newHotkey),
  applicationLoopbackStop: () =>
    ipcRenderer.invoke('desktop:application-loopback-stop'),
  applicationLoopbackGetDiagnostics: () =>
    ipcRenderer.invoke('desktop:application-loopback-diagnostics'),
  applicationLoopbackPcmConsumerReady: () =>
    ipcRenderer.invoke('desktop:application-loopback-pcm-ready'),
  consumeDisplayMediaAudioRoute: () =>
    ipcRenderer.invoke('desktop:consume-display-media-audio-route'),
  subscribeApplicationLoopbackPcm: (onData, onEnd) => {
    if (typeof onData !== 'function' || typeof onEnd !== 'function') {
      return () => { };
    }
    const onChunk = (_e, payload) => {
      const buf = Buffer.isBuffer(payload)
        ? payload
        : payload
          ? Buffer.from(payload)
          : null;
      if (!buf) return;
      onData(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      );
    };
    const onPcmEnd = () => {
      onEnd();
    };
    ipcRenderer.on('desktop:application-loopback-pcm', onChunk);
    ipcRenderer.on('desktop:application-loopback-pcm-end', onPcmEnd);
    return () => {
      ipcRenderer.removeListener('desktop:application-loopback-pcm', onChunk);
      ipcRenderer.removeListener(
        'desktop:application-loopback-pcm-end',
        onPcmEnd
      );
    };
  },
  displayMediaPicker: {
    listSources: () => ipcRenderer.invoke('desktop:display-media:list-sources'),
    submit: (payload) =>
      ipcRenderer.invoke('desktop:display-media:submit', payload),
    cancel: () => ipcRenderer.invoke('desktop:display-media:cancel')
  }
});
