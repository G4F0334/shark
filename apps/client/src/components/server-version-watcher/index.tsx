import { useServerVersionWatch } from '@/hooks/use-server-version-watch';
import { memo } from 'react';

const ServerVersionWatcher = memo(() => {
  useServerVersionWatch();

  return null;
});

export { ServerVersionWatcher };
