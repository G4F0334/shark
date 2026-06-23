/// <reference types="vite/client" />
/// <reference types="zzfx" />

// Extend the Window interface for global functions
declare global {
  interface Window {
    useToken: (token: string) => Promise<void>;
    openSoundsModal?: () => void;
    printVoiceStats?: () => void;
    DEBUG?: boolean;

    // plugin store exposed for plugins to use imperatively
    __SHARKORD_STORE__: import('@sharkord/shared').TPluginStore;

    // libs exposed for plugins to use
    __SHARKORD_EXPOSED_LIBS__: {
      createSelector: typeof import('@reduxjs/toolkit').createSelector;
      createCachedSelector: typeof import('re-reselect').createCachedSelector;
    };

    // react and react-dom for plugins to use, injected in main.tsx
    __SHARKORD_REACT__: typeof import('react');
    __SHARKORD_REACT_JSX__: typeof import('react/jsx-runtime');
    __SHARKORD_REACT_JSX_DEV__: typeof import('react/jsx-dev-runtime');
    __SHARKORD_REACT_DOM__: typeof import('react-dom');
    __SHARKORD_REACT_DOM_CLIENT__: typeof import('react-dom/client');

    desktop?: {
      platform?: string;
      isElectron?: boolean;
      voiceActivity?: (status: string) => Promise<void>;
      reloadHotkeys?: (keys: string) => Promise<{ ok: boolean }>;
      changeHotkey?: (newHotkey: any) => Promise<void>;
      applicationLoopbackStop?: () => Promise<{ ok: boolean }>;
      applicationLoopbackPcmConsumerReady?: () => Promise<{ ok: boolean }>;
      consumeDisplayMediaAudioRoute?: () => Promise<{
        audioRoute: 'application-loopback' | 'chromium-loopback' | 'none';
      }>;
      subscribeApplicationLoopbackPcm?: (
        onData: (data: ArrayBuffer) => void,
        onEnd: () => void
      ) => () => void;
      storage?: {
        readAll: () => Promise<Record<string, string>>;
        setItem: (key: string, value: string) => Promise<{ ok: boolean }>;
        removeItem: (key: string) => Promise<{ ok: boolean }>;
      };
    };
  }

  const VITE_APP_VERSION: string;
}

// this provides type definitions for i18n setup
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof import('./locales/en/common.json');
      connect: typeof import('./locales/en/connect.json');
      disconnected: typeof import('./locales/en/disconnected.json');
      sidebar: typeof import('./locales/en/sidebar.json');
      topbar: typeof import('./locales/en/topbar.json');
      dialogs: typeof import('./locales/en/dialogs.json');
      settings: typeof import('./locales/en/settings.json');
      permissions: typeof import('./locales/en/permissions.json');
    };
  }
}

export {};
