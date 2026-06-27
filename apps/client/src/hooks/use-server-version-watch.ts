import { fetchServerInfo } from '@/features/app/actions';
import { logDebug } from '@/helpers/browser-logger';
import i18n from 'i18next';
import { useEffect } from 'react';
import { toast } from 'sonner';

const POLL_INTERVAL_MS = 45_000;
const WEB_RELOAD_GUARD_KEY = 'sharkord-web-version-reload';
const DESKTOP_UPDATE_TOAST_ID = 'desktop-version-update';
const WEB_UPDATE_TOAST_ID = 'web-version-update';

const tCommon = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key, { ns: 'common', ...options });

const reloadWebClient = () => {
  window.location.reload();
};

const openDesktopUpdateDownload = async (downloadUrl: string) => {
  if (typeof window.desktop?.openDesktopUpdateDownload !== 'function') {
    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  await window.desktop.openDesktopUpdateDownload(downloadUrl);
};

const useServerVersionWatch = () => {
  useEffect(() => {
    const isElectron = window.desktop?.isElectron === true;
    const electronAppVersion = window.desktop?.appVersion;

    let knownServerVersion: string | undefined;
    let knownDesktopVersion: string | undefined;
    let notifiedDesktopVersion: string | undefined;
    let webReloadScheduled = false;

    const notifyDesktopUpdate = (
      nextDesktopVersion: string,
      downloadUrl: string
    ) => {
      if (notifiedDesktopVersion === nextDesktopVersion) return;

      notifiedDesktopVersion = nextDesktopVersion;

      toast.info(tCommon('clientUpdateAvailableTitle'), {
        id: DESKTOP_UPDATE_TOAST_ID,
        description: tCommon('clientDesktopUpdateAvailableDesc', {
          version: nextDesktopVersion
        }),
        action: {
          label: tCommon('clientDownloadDesktopUpdate'),
          onClick: () => {
            void openDesktopUpdateDownload(downloadUrl);
          }
        },
        duration: Infinity
      });

      logDebug('[desktop] Desktop update available', {
        nextDesktopVersion,
        currentAppVersion: electronAppVersion,
        downloadUrl
      });
    };

    const notifyWebUpdate = (nextVersion: string) => {
      if (webReloadScheduled) return;

      toast.info(tCommon('clientUpdateAvailableTitle'), {
        id: WEB_UPDATE_TOAST_ID,
        description: tCommon('clientUpdateAvailableDesc', {
          version: nextVersion
        }),
        action: {
          label: tCommon('reloadApp'),
          onClick: () => {
            reloadWebClient();
          }
        },
        duration: Infinity
      });

      logDebug('[client] Web client update available', {
        nextVersion,
        previousVersion: knownServerVersion
      });
    };

    const checkServerVersion = async () => {
      const info = await fetchServerInfo();

      if (!info) return;

      if (isElectron) {
        const { desktopVersion, desktopDownloadUrl } = info;

        if (!desktopVersion || !desktopDownloadUrl || !electronAppVersion) {
          return;
        }

        if (!knownDesktopVersion) {
          knownDesktopVersion = desktopVersion;
        }

        if (electronAppVersion !== desktopVersion) {
          notifyDesktopUpdate(desktopVersion, desktopDownloadUrl);
        } else if (knownDesktopVersion !== desktopVersion) {
          knownDesktopVersion = desktopVersion;
          notifiedDesktopVersion = undefined;
        }

        return;
      }

      const nextVersion = info.version;

      if (!nextVersion) return;

      if (!knownServerVersion) {
        knownServerVersion = nextVersion;

        if (VITE_APP_VERSION !== nextVersion) {
          const reloadGuard = sessionStorage.getItem(WEB_RELOAD_GUARD_KEY);

          if (reloadGuard !== nextVersion) {
            sessionStorage.setItem(WEB_RELOAD_GUARD_KEY, nextVersion);
            webReloadScheduled = true;
            notifyWebUpdate(nextVersion);
          }
        }

        return;
      }

      if (knownServerVersion !== nextVersion) {
        webReloadScheduled = true;
        notifyWebUpdate(nextVersion);
      }
    };

    void checkServerVersion();

    const intervalId = window.setInterval(() => {
      void checkServerVersion();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);
};

export { useServerVersionWatch };
