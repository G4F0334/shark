const getSupportedConstraints = () => {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return null;
  }

  if (typeof navigator.mediaDevices.getSupportedConstraints !== 'function') {
    return null;
  }

  try {
    return navigator.mediaDevices.getSupportedConstraints();
  } catch {
    return null;
  }
};

const getRestrictOwnAudioSupport = () => {
  const constraints = getSupportedConstraints();

  // @ts-expect-error - this is experimental and not in the types yet
  return !!constraints?.restrictOwnAudio;
};

const getSuppressLocalAudioPlaybackSupport = () => {
  const constraints = getSupportedConstraints();

  // @ts-expect-error - this is experimental and not in the types yet
  return !!constraints?.suppressLocalAudioPlayback;
};

const isDisplayMediaUserCancel = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;

  const name = 'name' in error ? String(error.name) : '';
  const message = error instanceof Error ? error.message : String(error);

  return (
    name === 'AbortError' ||
    name === 'NotAllowedError' ||
    /aborted a request/i.test(message) ||
    /starting capture/i.test(message) ||
    /permission denied/i.test(message) ||
    /user denied/i.test(message) ||
    /video was requested/i.test(message) ||
    /invoking remote method 'desktop:display-media:cancel'/i.test(message)
  );
};

export {
  getRestrictOwnAudioSupport,
  getSuppressLocalAudioPlaybackSupport,
  isDisplayMediaUserCancel
};
