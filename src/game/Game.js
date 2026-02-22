import * as THREE from 'three';
import { generateMaze } from './maze.js';
import {
  ROOM_COLORS,
  getTraversalTransportMatrix,
  getWallBasis,
  getWallVector,
  getWallsForRoom,
  invertOrthonormalMatrix,
} from './topology.js';
import {
  IDENTITY_MATRIX,
  applyMatrixToVector,
  matrixSignature,
  matrixToQuaternion,
  multiplyMatrices,
  rotateWorld,
} from './orientation.js';
import { ROOM_HALF_SIZE, createRoomMesh } from '../render/room.js';
import { createShuttle } from '../render/shuttle.js';

const MODES = {
  START: 'START',
  PLAYING: 'PLAYING',
  ROTATING: 'ROTATING',
  TRAVERSING: 'TRAVERSING',
  WIN: 'WIN',
};

const SHUTTLE_ARM_AXES = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function dotArray(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function toHexString(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/**
 * @param {{
 *  scene: THREE.Scene,
 *  camera: THREE.PerspectiveCamera,
 *  overlay: { setMode: (mode: string) => void, setRoom: (payload: {roomId: string, colorName: string, colorHex: number}) => void, setStatus: (text: string, isPositive?: boolean) => void },
 *  sound?: { prime?: () => void, setIdlePulseActive?: (active: boolean) => void, onTurn?: () => void, onMisalignedSpace?: () => void, onTraverseStart?: () => void, onTraverseSwap?: () => void, onWin?: () => void },
 *  seed?: number,
 *  rotationMs?: number,
 *  traverseMs?: number,
 * }} config
 */
export function createGame(config) {
  const {
    scene,
    camera,
    overlay,
    sound,
    seed,
    rotationMs = 220,
    traverseMs = 1300,
  } = config;

  const maze = generateMaze({ seed });

  const roomRig = new THREE.Group();
  scene.add(roomRig);
  const transportRig = new THREE.Group();
  transportRig.matrixAutoUpdate = false;
  roomRig.add(transportRig);

  const roomMeshes = new Map();
  for (const roomId of Object.keys(maze.rooms)) {
    roomMeshes.set(roomId, createRoomMesh(roomId, maze.rooms[roomId].walls));
  }

  let currentRoomId = maze.startRoomId;
  let activeRoomMesh = roomMeshes.get(currentRoomId);
  transportRig.add(activeRoomMesh);

  const shuttle = createShuttle();
  // Keep the shuttle in the view frame (turns rotate it), but do not apply
  // traversal transport to its visual mesh or it will "snap" on room swaps.
  roomRig.add(shuttle);

  let mode = MODES.START;
  let viewOrientation = [...IDENTITY_MATRIX];
  let transportOrientation = [...IDENTITY_MATRIX];
  roomRig.quaternion.copy(matrixToQuaternion(viewOrientation));

  let rotationAnim = null;
  let traverseAnim = null;
  const cameraForward = new THREE.Vector3();

  function getEffectiveOrientation() {
    return multiplyMatrices(viewOrientation, transportOrientation);
  }

  function syncTransportRigMatrix() {
    transportRig.matrix.set(
      transportOrientation[0], transportOrientation[1], transportOrientation[2], 0,
      transportOrientation[3], transportOrientation[4], transportOrientation[5], 0,
      transportOrientation[6], transportOrientation[7], transportOrientation[8], 0,
      0, 0, 0, 1,
    );
    transportRig.matrixWorldNeedsUpdate = true;
  }

  function updateRoomFog(roomId) {
    const base = new THREE.Color(ROOM_COLORS[roomId].hex);
    scene.fog.color.copy(base.multiplyScalar(0.17));
  }

  function refreshCameraBasis() {
    camera.getWorldDirection(cameraForward).normalize();
  }

  function getWallCandidates() {
    refreshCameraBasis();
    const effectiveOrientation = getEffectiveOrientation();

    const candidates = [];

    for (const wallKey of getWallsForRoom(currentRoomId)) {
      const normalLocal = getWallVector(currentRoomId, wallKey);
      const normalWorld = applyMatrixToVector(effectiveOrientation, normalLocal);
      const forwardDot =
        normalWorld[0] * cameraForward.x +
        normalWorld[1] * cameraForward.y +
        normalWorld[2] * cameraForward.z;
      if (forwardDot <= 0.05) {
        continue;
      }

      candidates.push({
        wallKey,
        normalLocal,
        normalWorld,
        forwardDot,
        score: forwardDot,
      });
    }

    candidates.sort((a, b) => b.forwardDot - a.forwardDot);

    return candidates;
  }

  function getShuttleWallOrientation(roomId, wallKey) {
    const { normal, u, v } = getWallBasis(roomId, wallKey);

    let h = 0;
    let vertical = 0;

    for (const armAxisLocal of SHUTTLE_ARM_AXES) {
      if (Math.abs(dotArray(armAxisLocal, normal)) > 0.6) {
        continue;
      }

      const hScore = dotArray(armAxisLocal, u);
      const vScore = dotArray(armAxisLocal, v);

      if (Math.abs(hScore) > 0.6) {
        h = hScore > 0 ? 1 : -1;
      }
      if (Math.abs(vScore) > 0.6) {
        vertical = vScore > 0 ? 1 : -1;
      }
    }

    if (h === 0 || vertical === 0) {
      return null;
    }

    return {
      h: /** @type {-1|1} */ (h),
      v: /** @type {-1|1} */ (vertical),
    };
  }

  function getAlignmentProbe() {
    const candidates = getWallCandidates();
    if (candidates.length === 0) {
      return null;
    }

    const frontWall = candidates[0];
    const wallState = maze.rooms[currentRoomId].walls[frontWall.wallKey];
    const shuttleWallOrientation = getShuttleWallOrientation(currentRoomId, frontWall.wallKey);
    const holeWallOrientation =
      wallState && wallState.type !== 'NONE' && wallState.orientation ? wallState.orientation : null;

    const aligned =
      shuttleWallOrientation !== null &&
      holeWallOrientation !== null &&
      holeWallOrientation.h === shuttleWallOrientation.h &&
      holeWallOrientation.v === shuttleWallOrientation.v;

    return {
      frontWall,
      wallState,
      shuttleScreenOrientation: shuttleWallOrientation,
      holeScreenOrientation: holeWallOrientation,
      aligned,
      canTraverse: aligned,
    };
  }

  function syncOverlay() {
    overlay.setMode(mode);

    const roomColor = ROOM_COLORS[currentRoomId];
    overlay.setRoom({
      roomId: currentRoomId,
      colorName: roomColor.name,
      colorHex: roomColor.hex,
    });

    if (mode === MODES.START) {
      overlay.setStatus('PRESS ENTER TO START', false);
      return;
    }

    if (mode === MODES.WIN) {
      overlay.setStatus('EXIT REACHED', true);
      return;
    }

    if (mode === MODES.ROTATING) {
      overlay.setStatus('ROTATING', false);
      return;
    }

    if (mode === MODES.TRAVERSING) {
      overlay.setStatus('TRAVERSING', true);
      return;
    }

    const probe = getAlignmentProbe();
    if (!probe || probe.wallState?.type === 'NONE') {
      overlay.setStatus('SOLID WALL', false);
      return;
    }

    overlay.setStatus(probe.aligned ? 'ALIGNED' : 'MISALIGNED', probe.aligned);
  }

  function beginRotation(axis, direction) {
    if (mode !== MODES.PLAYING) {
      return;
    }

    sound?.onTurn?.();
    const targetMatrix = rotateWorld(viewOrientation, axis, direction);

    rotationAnim = {
      elapsedMs: 0,
      durationMs: rotationMs,
      fromQuat: roomRig.quaternion.clone(),
      toQuat: matrixToQuaternion(targetMatrix),
      targetMatrix,
    };
    mode = MODES.ROTATING;
  }

  function beginTraverse() {
    if (mode !== MODES.PLAYING) {
      return;
    }

    const probe = getAlignmentProbe();
    if (!probe || !probe.canTraverse) {
      sound?.onMisalignedSpace?.();
      return;
    }

    const wallState = probe.wallState;
    const isExit = wallState.type === 'EXIT';
    if (!isExit) {
      sound?.onTraverseStart?.();
    }

    // Room meshes are transformed in roomRig local space, so traversal direction
    // must also be local to avoid double-rotation artifacts.
    const travelDir = new THREE.Vector3(
      probe.frontWall.normalLocal[0],
      probe.frontWall.normalLocal[1],
      probe.frontWall.normalLocal[2],
    ).normalize();
    const travelDistance = ROOM_HALF_SIZE;

    let nextMesh = null;
    let transportStep = null;
    if (!isExit) {
      nextMesh = roomMeshes.get(wallState.toRoomId);
      if (nextMesh.parent) {
        nextMesh.parent.remove(nextMesh);
      }
      nextMesh.position.set(0, 0, 0);
      transportStep = getTraversalTransportMatrix(currentRoomId, probe.frontWall.wallKey);
    }

    traverseAnim = {
      elapsedMs: 0,
      durationMs: traverseMs,
      isExit,
      travelDir,
      travelDistance,
      fromRoomId: currentRoomId,
      toRoomId: wallState.toRoomId,
      currentMesh: activeRoomMesh,
      nextMesh,
      transportStep,
      swapped: false,
    };

    mode = MODES.TRAVERSING;
  }

  function updateRotation(dtMs) {
    if (!rotationAnim) {
      return;
    }

    rotationAnim.elapsedMs += dtMs;
    const t = Math.min(rotationAnim.elapsedMs / rotationAnim.durationMs, 1);
    const eased = easeInOutCubic(t);

    roomRig.quaternion.slerpQuaternions(rotationAnim.fromQuat, rotationAnim.toQuat, eased);

    if (t >= 1) {
      roomRig.quaternion.copy(rotationAnim.toQuat);
      viewOrientation = rotationAnim.targetMatrix;
      rotationAnim = null;
      mode = MODES.PLAYING;
    }
  }

  function updateTraversal(dtMs) {
    if (!traverseAnim) {
      return;
    }

    traverseAnim.elapsedMs += dtMs;
    const rawT = Math.min(traverseAnim.elapsedMs / traverseAnim.durationMs, 1);

    if (traverseAnim.isExit) {
      const t = easeInOutCubic(rawT);
      traverseAnim.currentMesh.position
        .copy(traverseAnim.travelDir)
        .multiplyScalar(-traverseAnim.travelDistance * t);
    } else if (rawT < 0.5) {
      const t = easeInOutCubic(rawT / 0.5);
      traverseAnim.currentMesh.position
        .copy(traverseAnim.travelDir)
        .multiplyScalar(-traverseAnim.travelDistance * t);
    } else {
      if (!traverseAnim.swapped) {
        transportRig.remove(traverseAnim.currentMesh);
        traverseAnim.currentMesh.position.set(0, 0, 0);

        activeRoomMesh = traverseAnim.nextMesh;
        currentRoomId = traverseAnim.toRoomId;

        if (traverseAnim.transportStep) {
          const inverseStep = invertOrthonormalMatrix(traverseAnim.transportStep);
          const nextDir = applyMatrixToVector(inverseStep, [
            traverseAnim.travelDir.x,
            traverseAnim.travelDir.y,
            traverseAnim.travelDir.z,
          ]);
          traverseAnim.travelDir.set(nextDir[0], nextDir[1], nextDir[2]).normalize();
          transportOrientation = multiplyMatrices(transportOrientation, traverseAnim.transportStep);
          syncTransportRigMatrix();
        }

        traverseAnim.nextMesh.position
          .copy(traverseAnim.travelDir)
          .multiplyScalar(traverseAnim.travelDistance);
        transportRig.add(traverseAnim.nextMesh);
        sound?.onTraverseSwap?.();
        traverseAnim.swapped = true;
        updateRoomFog(currentRoomId);
      }

      const t = easeInOutCubic((rawT - 0.5) / 0.5);
      traverseAnim.nextMesh.position
        .copy(traverseAnim.travelDir)
        .multiplyScalar(traverseAnim.travelDistance * (1 - t));
    }

    if (rawT >= 1) {
      if (traverseAnim.isExit) {
        mode = MODES.WIN;
        sound?.onWin?.();
      } else {
        traverseAnim.nextMesh.position.set(0, 0, 0);
        mode = MODES.PLAYING;
      }
      traverseAnim = null;
    }
  }

  function onKeyDown(event) {
    const key = event.key;
    if (
      key === 'ArrowLeft' ||
      key === 'ArrowRight' ||
      key === 'ArrowUp' ||
      key === 'ArrowDown' ||
      key === ' ' ||
      key === 'Spacebar'
    ) {
      event.preventDefault();
    }

    if (event.repeat) {
      return;
    }

    sound?.prime?.();

    if (mode === MODES.START) {
      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        mode = MODES.PLAYING;
      }
      return;
    }

    if (mode === MODES.WIN || mode === MODES.ROTATING || mode === MODES.TRAVERSING) {
      return;
    }

    if (key === 'ArrowLeft') {
      beginRotation('y', -1);
    } else if (key === 'ArrowRight') {
      beginRotation('y', 1);
    } else if (key === 'ArrowUp') {
      beginRotation('x', 1);
    } else if (key === 'ArrowDown') {
      beginRotation('x', -1);
    } else if (key === ' ' || key === 'Spacebar') {
      beginTraverse();
    }
  }

  window.addEventListener('keydown', onKeyDown, { passive: false });

  syncTransportRigMatrix();
  updateRoomFog(currentRoomId);
  syncOverlay();

  function update(dtSeconds) {
    const dtMs = Math.max(0, dtSeconds * 1000);

    updateRotation(dtMs);
    updateTraversal(dtMs);
    sound?.setIdlePulseActive?.(mode === MODES.PLAYING);

    syncOverlay();
  }

  function advanceTime(ms) {
    const stepMs = 1000 / 60;
    let remaining = Math.max(0, ms);
    while (remaining > 0) {
      const chunk = Math.min(stepMs, remaining);
      update(chunk / 1000);
      remaining -= chunk;
    }
  }

  function renderGameToText() {
    const probe = getAlignmentProbe();
    const wallState = probe?.wallState ?? null;
    const effectiveOrientation = getEffectiveOrientation();

    const payload = {
      mode,
      coordinateSystem: 'World axes: +X right, +Y up, +Z forward from shuttle center.',
      room: {
        id: currentRoomId,
        colorName: ROOM_COLORS[currentRoomId].name,
        colorHex: toHexString(ROOM_COLORS[currentRoomId].hex),
      },
      frontWall: probe
        ? {
            wallKey: probe.frontWall.wallKey,
            type: wallState?.type ?? null,
            toRoomId: wallState?.toRoomId ?? null,
            holeOrientationRaw: wallState?.orientation ?? null,
            holeOrientationScreen: probe.holeScreenOrientation,
          }
        : null,
      shuttle: {
        projection: probe?.shuttleScreenOrientation ?? null,
      },
      alignment: probe?.aligned ?? false,
      orientationSignature: matrixSignature(effectiveOrientation),
      animation: rotationAnim
        ? {
            kind: 'ROTATE',
            progress: Math.min(rotationAnim.elapsedMs / rotationAnim.durationMs, 1),
          }
        : traverseAnim
          ? {
              kind: 'TRAVERSE',
              progress: Math.min(traverseAnim.elapsedMs / traverseAnim.durationMs, 1),
              toRoomId: traverseAnim.toRoomId,
            }
          : null,
      win: mode === MODES.WIN,
      seed: maze.seed,
      mazeExit: maze.exit,
    };

    return JSON.stringify(payload);
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
  }

  return {
    update,
    advanceTime,
    renderGameToText,
    dispose,
  };
}
