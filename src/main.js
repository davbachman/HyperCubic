import './styles.css';

import { createSoundscape } from './audio/soundscape.js';
import { createGame } from './game/Game.js';
import { createSceneSystem } from './render/scene.js';
import { createOverlay } from './ui/overlay.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
const overlayRoot = /** @type {HTMLDivElement} */ (document.getElementById('overlay-root'));
const appRoot = /** @type {HTMLDivElement} */ (document.getElementById('app'));

const sceneSystem = createSceneSystem(canvas);
const overlay = createOverlay(overlayRoot);
const sound = createSoundscape();

const game = createGame({
  scene: sceneSystem.scene,
  camera: sceneSystem.camera,
  overlay,
  sound,
  rotationMs: 220,
  traverseMs: 1300,
});

function resize() {
  sceneSystem.resize();
}

window.addEventListener('resize', resize);
window.addEventListener('fullscreenchange', resize);
resize();

let lastTime = performance.now();

function frame(now) {
  const dtSeconds = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  game.update(dtSeconds);
  sceneSystem.render();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

window.render_game_to_text = () => game.renderGameToText();
window.advanceTime = (ms) => {
  game.advanceTime(ms);
  sceneSystem.render();
};

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await appRoot.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
}

window.addEventListener(
  'keydown',
  (event) => {
    if (event.key.toLowerCase() !== 'f') {
      return;
    }
    event.preventDefault();
    toggleFullscreen().catch((error) => {
      // Fullscreen can fail due to browser gesture policies.
      console.error(error);
    });
  },
  { passive: false },
);
