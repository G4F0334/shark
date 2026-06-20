import { session } from 'electron';

export const SHARKORD_SESSION_PARTITION = 'persist:sharkord';

export const getSharkordSession = () =>
  session.fromPartition(SHARKORD_SESSION_PARTITION);
