import { animate } from './canvas.js';
import { setupEvents } from './events.js';
import { initSocket } from './socketHandlers.js';
import { setupReplayControls } from './replay.js';

function start() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  const info = document.getElementById('room-info');
  if (info && room) {
    info.textContent = `Room Code: ${room}`;
  }
  setupEvents();
  initSocket();
  setupReplayControls();
  animate();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
