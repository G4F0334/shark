import type { RtpCodecCapability } from 'mediasoup-client/types';

const OPENH264_BASELINE_PROFILE_LEVEL_ID = '42e01f';

/**
 * Router often advertises two H264 entries: baseline (42e01f / OpenH264) and high
 * (e.g. 640032 / Media Foundation or VideoToolbox). Mediasoup's `.find` by
 * mimeType alone picks the first — baseline — so the encoder stays CPU. Prefer
 * high-profile when present so Chromium can use HW encoders.
 */
function pickScreenShareH264Codec(
  codecs: RtpCodecCapability[] | undefined
): RtpCodecCapability | undefined {
  if (!codecs?.length) return undefined;
  const h264 = codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264');
  if (h264.length === 0) return undefined;
  if (h264.length === 1) return h264[0];

  const profileLevelId = (c: RtpCodecCapability) =>
    String(c.parameters?.['profile-level-id'] ?? '');

  return (
    h264.find((c) => profileLevelId(c) === '640032') ??
    h264.find((c) => {
      const pli = profileLevelId(c);
      return pli !== '' && pli !== OPENH264_BASELINE_PROFILE_LEVEL_ID;
    }) ??
    h264[0]
  );
}

export { pickScreenShareH264Codec };
