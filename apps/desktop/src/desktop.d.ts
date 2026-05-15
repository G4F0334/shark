export {};

declare global {
  interface Window {
    desktop?: {
      platform: NodeJS.Platform;
      applicationLoopbackStop?: () => Promise<{ ok: boolean }>;
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
      };
    };
  }
}
