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
const urlParams = new URLSearchParams(window.location.search);
const seedParam = urlParams.get('seed');
const parsedSeed = seedParam === null ? null : Number(seedParam);
const seed = Number.isFinite(parsedSeed) ? (Math.floor(parsedSeed) >>> 0) : undefined;

const game = createGame({
  scene: sceneSystem.scene,
  camera: sceneSystem.camera,
  overlay,
  sound,
  seed,
  rotationMs: 220,
  traverseMs: 1300,
});

const TOUCH_SWIPE_MIN_PX = 28;

/** @type {{ pointerId: number, startX: number, startY: number }|null} */
let touchGesture = null;

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

function handleMobileTouchAction(action) {
  game.handleAction(action);
}

function onCanvasPointerDown(event) {
  if (event.pointerType !== 'touch') {
    return;
  }

  touchGesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
  };

  try {
    canvas.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic events (automation) may not register an active pointer.
  }
  event.preventDefault();
}

function onCanvasPointerUp(event) {
  if (event.pointerType !== 'touch' || !touchGesture || event.pointerId !== touchGesture.pointerId) {
    return;
  }

  const dx = event.clientX - touchGesture.startX;
  const dy = event.clientY - touchGesture.startY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (Math.max(absX, absY) < TOUCH_SWIPE_MIN_PX) {
    handleMobileTouchAction('FORWARD');
  } else if (absX >= absY) {
    handleMobileTouchAction(dx > 0 ? 'ROTATE_RIGHT' : 'ROTATE_LEFT');
  } else {
    handleMobileTouchAction(dy > 0 ? 'ROTATE_DOWN' : 'ROTATE_UP');
  }

  touchGesture = null;
  try {
    canvas.releasePointerCapture?.(event.pointerId);
  } catch {
    // Synthetic events (automation) may not register an active pointer.
  }
  event.preventDefault();
}

function clearTouchGesture(event) {
  if (event.pointerType !== 'touch') {
    return;
  }
  if (touchGesture && event.pointerId === touchGesture.pointerId) {
    touchGesture = null;
  }
}

canvas.addEventListener('pointerdown', onCanvasPointerDown, { passive: false });
canvas.addEventListener('pointerup', onCanvasPointerUp, { passive: false });
canvas.addEventListener('pointercancel', clearTouchGesture, { passive: true });

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
