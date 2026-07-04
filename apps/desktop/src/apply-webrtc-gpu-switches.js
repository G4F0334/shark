import { app } from 'electron';

const WEBRTC_GPU_FEATURES = [
  'WebRtcAllowWgcScreenCapturer',
  'WebRtcAllowWgcWindowCapturer'
];

const WEBRTC_GPU_DISABLED_FEATURES = [
  'OpenH264SoftwareEncoder',
  'CalculateNativeWinOcclusion'
];

const appendSwitchList = (name, values) => {
  const existing = app.commandLine.getSwitchValue(name);
  const merged = new Set([
    ...existing.split(',').filter(Boolean),
    ...values.filter(Boolean)
  ]);

  if (merged.size === 0) return;

  app.commandLine.appendSwitch(name, [...merged].join(','));
};

/** Prefer HW H.264 (Media Foundation / VideoToolbox) over OpenH264 in WebRTC. */
function applyWebRtcGpuEncodingPreferences() {
  if (process.env.DESKTOP_WEBRTC_SOFTWARE_H264 === '1') return;

  const platform = process.platform;
  if (platform !== 'win32' && platform !== 'darwin') return;

  app.commandLine.appendSwitch('force_high_performance_gpu');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

  if (platform === 'win32') {
    app.commandLine.appendSwitch('use-angle', 'd3d11');
  }

  appendSwitchList('enable-features', WEBRTC_GPU_FEATURES);
  appendSwitchList('disable-features', WEBRTC_GPU_DISABLED_FEATURES);
}

export { applyWebRtcGpuEncodingPreferences };
