import { app } from 'electron';

/** Prefer HW H.264 (Media Foundation / VideoToolbox) over OpenH264 in WebRTC. */
function applyWebRtcGpuEncodingPreferences() {
  if (process.env.DESKTOP_WEBRTC_SOFTWARE_H264 === '1') return;

  const platform = process.platform;
  if (platform !== 'win32' && platform !== 'darwin') return;

  app.commandLine.appendSwitch('force_high_performance_gpu');
  app.commandLine.appendSwitch('disable-features', 'OpenH264SoftwareEncoder');
}

export { applyWebRtcGpuEncodingPreferences };
