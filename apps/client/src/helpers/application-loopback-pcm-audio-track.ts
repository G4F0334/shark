const SAMPLE_RATE = 48000;
const FRAME_BYTES = 4;

/** int16 → float32 [-1, 1] */
function i16ToFloat(v: number) {
  return v < 0 ? v / 0x8000 : v / 0x7fff;
}

function mergeBytes(a: Uint8Array, b: Uint8Array) {
  const o = new Uint8Array(a.byteLength + b.byteLength);
  o.set(a, 0);
  o.set(b, a.byteLength);
  return o;
}

export type TApplicationLoopbackPcmSubscribe = (
  onData: (data: ArrayBuffer) => void,
  onEnd: () => void
) => () => void;

/**
 * PCM s16le stereo 48 kHz с stdout ApplicationLoopback.exe → MediaStreamTrack (WebRTC).
 */
export async function createApplicationLoopbackPcmAudioTrack(opts: {
  subscribe: TApplicationLoopbackPcmSubscribe;
  signalConsumerReady: () => Promise<void>;
}): Promise<{ track: MediaStreamTrack; dispose: () => Promise<void> }> {
  const { subscribe, signalConsumerReady } = opts;
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (typeof AudioContextCtor !== 'function') {
    throw new Error('AudioContext is not available');
  }

  const ctx = new AudioContextCtor({ sampleRate: SAMPLE_RATE }) as AudioContext;
  await ctx.resume();

  const queue: Uint8Array[] = [];
  let carry = new Uint8Array(0);
  let unsub: (() => void) | undefined;
  unsub = subscribe(
    (ab) => {
      const u8 = new Uint8Array(ab);
      queue.push(u8);
    },
    () => {
      queue.length = 0;
      carry = new Uint8Array(0);
    }
  );

  await signalConsumerReady();

  if (typeof ctx.createScriptProcessor !== 'function') {
    unsub?.();
    await ctx.close().catch(() => undefined);
    throw new Error('createScriptProcessor not supported in this runtime');
  }

  const bufferSize = 2048;
  const processor = ctx.createScriptProcessor(bufferSize, 0, 2);
  const dest = ctx.createMediaStreamDestination();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(processor);
  processor.connect(dest);
  osc.start();

  processor.onaudioprocess = (ev) => {
    const outL = ev.outputBuffer.getChannelData(0);
    const outR = ev.outputBuffer.getChannelData(1);
    const need = outL.length;
    let filled = 0;

    while (filled < need) {
      if (carry.byteLength < FRAME_BYTES) {
        const next = queue.shift();
        if (!next) break;
        carry = mergeBytes(carry, next);
        continue;
      }
      const dv = new DataView(
        carry.buffer,
        carry.byteOffset,
        carry.byteLength
      );
      outL[filled] = i16ToFloat(dv.getInt16(0, true));
      outR[filled] = i16ToFloat(dv.getInt16(2, true));
      carry = carry.subarray(FRAME_BYTES);
      filled += 1;
    }

    while (filled < need) {
      outL[filled] = 0;
      outR[filled] = 0;
      filled += 1;
    }
  };

  const [track] = dest.stream.getAudioTracks();
  if (!track) {
    processor.disconnect();
    gain.disconnect();
    osc.stop();
    unsub?.();
    await ctx.close().catch(() => undefined);
    throw new Error('Failed to create ApplicationLoopback audio track');
  }

  const dispose = async () => {
    try {
      unsub?.();
      unsub = undefined;
      processor.disconnect();
      gain.disconnect();
      osc.stop();
      track.stop();
      await ctx.close().catch(() => undefined);
    } catch {
      /**/
    }
  };

  return { track, dispose };
}
