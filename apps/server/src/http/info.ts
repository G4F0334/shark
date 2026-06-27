import type { TServerInfo } from '@sharkord/shared';
import http from 'http';
import { getSettings } from '../db/queries/server';
import {
  DESKTOP_DOWNLOAD_URL,
  DESKTOP_VERSION,
  SERVER_VERSION
} from '../utils/env';

const infoRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const settings = await getSettings();

  const info: TServerInfo = {
    serverId: settings.serverId,
    version: SERVER_VERSION,
    name: settings.name,
    description: settings.description,
    logo: settings.logo,
    allowNewUsers: settings.allowNewUsers,
    ...(DESKTOP_DOWNLOAD_URL
      ? {
          desktopVersion: DESKTOP_VERSION,
          desktopDownloadUrl: DESKTOP_DOWNLOAD_URL
        }
      : {})
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(info));
};

export { infoRouteHandler };
