export {};

declare global {
  interface Window {
    desktop?: {
      platform: NodeJS.Platform;
      isElectron?: boolean;
      appVersion?: string;
      openDesktopUpdateDownload?: (
        url: string
      ) => Promise<{ ok: boolean; error?: string }>;
      applicationLoopbackStop?: () => Promise<{ ok: boolean }>;
      applicationLoopbackPcmConsumerReady?: () => Promise<{ ok: boolean }>;
      consumeDisplayMediaAudioRoute?: () => Promise<{
        audioRoute: 'application-loopback' | 'chromium-loopback' | 'none';
      }>;
      /** Подписка на PCM с main; возвращает unsubscribe. */
      subscribeApplicationLoopbackPcm?: (
        onData: (data: ArrayBuffer) => void,
        onEnd: () => void
      ) => () => void;
      applicationLoopbackGetDiagnostics?: () => Promise<{
        ok: boolean;
        diagnostics: {
          exePath: string;
          exeExists: boolean;
          childRunning: boolean;
          childPid: number | null;
          lastArgv: readonly string[];
          lastSpawnUnixMs: number | null;
          lastExitCode: number | null;
          lastExitSignal: string | null;
          lastIssue: string | null;
        };
      }>;
      displayMediaPicker?: {
        listSources: () => Promise<
          {
            id: string;
            name: string;
            display_id: string;
            isScreen: boolean;
            thumb: string;
          }[]
        >;
        submit: (payload: { sourceId: string }) => Promise<{
          ok: boolean;
          error?: string;
        }>;
        cancel: () => Promise<{ ok: boolean }>;
        reset: () => Promise<{ ok: boolean }>;
      };
    };
  }
}
