const meta = document.getElementById('meta');

if (window.desktop?.platform) {
  meta.textContent = `Platform: ${window.desktop.platform} · Electron shell is running.`;
} else {
  meta.textContent = 'Preload bridge unavailable.';
}
