import * as THREE from 'three';
import { generateMaze } from './maze.js';
import {
  ROOM_COLORS,
  getWallBasis,
  getWallVector,
  getWallsForRoom,
} from './topology.js';
import {
  IDENTITY_MATRIX,
  applyMatrixToVector,
  matrixSignature,
  matrixToQuaternion,
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
    seed,
    rotationMs = 220,
    traverseMs = 1300,
  } = config;

  const maze = generateMaze({ seed });

  const roomRig = new THREE.Group();
  scene.add(roomRig);

  const roomMeshes = new Map();
  for (const roomId of Object.keys(maze.rooms)) {
    roomMeshes.set(roomId, createRoomMesh(roomId, maze.rooms[roomId].walls));
  }

  let currentRoomId = maze.startRoomId;
  let activeRoomMesh = roomMeshes.get(currentRoomId);
  roomRig.add(activeRoomMesh);

  const shuttle = createShuttle();
  scene.add(shuttle);

  let mode = MODES.START;
  let orientation = [...IDENTITY_MATRIX];
  roomRig.quaternion.copy(matrixToQuaternion(orientation));

  let rotationAnim = null;
  let traverseAnim = null;
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const wallCenterVec = new THREE.Vector3();
  const wallViewVec = new THREE.Vector3();
  const projectedVec = new THREE.Vector3();

  function updateRoomFog(roomId) {
    const base = new THREE.Color(ROOM_COLORS[roomId].hex);
    scene.fog.color.copy(base.multiplyScalar(0.17));
  }

  function syncShuttleRotation() {
    shuttle.quaternion.copy(roomRig.quaternion);
  }

  function refreshCameraBasis() {
    camera.getWorldDirection(cameraForward).normalize();
    cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  }

  function getWallCandidates() {
    refreshCameraBasis();

    const candidates = [];

    for (const wallKey of getWallsForRoom(currentRoomId)) {
      const normalLocal = getWallVector(currentRoomId, wallKey);
      const normalWorld = applyMatrixToVector(orientation, normalLocal);
      wallCenterVec
        .set(normalWorld[0], normalWorld[1], normalWorld[2])
        .multiplyScalar(ROOM_HALF_SIZE);
      wallViewVec.copy(wallCenterVec).sub(camera.position).normalize();
      const forwardDot = wallViewVec.dot(cameraForward);
      if (forwardDot <= 0.05) {
        continue;
      }

      projectedVec.copy(wallCenterVec).project(camera);
      const distanceSq = projectedVec.x * projectedVec.x + projectedVec.y * projectedVec.y;

      candidates.push({
        wallKey,
        normalLocal,
        normalWorld,
        forwardDot,
        distanceSq,
        score: -distanceSq,
      });
    }

    candidates.sort((a, b) => {
      if (Math.abs(a.distanceSq - b.distanceSq) > 1e-6) {
        return a.distanceSq - b.distanceSq;
      }
      return b.forwardDot - a.forwardDot;
    });

    return candidates;
  }

  function getHoleScreenOrientation(roomId, wallKey, holeOrientation) {
    if (!holeOrientation) {
      return null;
    }

    const { u, v } = getWallBasis(roomId, wallKey);
    const hWorld = applyMatrixToVector(orientation, [
      u[0] * holeOrientation.h,
      u[1] * holeOrientation.h,
      u[2] * holeOrientation.h,
    ]);
    const vWorld = applyMatrixToVector(orientation, [
      v[0] * holeOrientation.v,
      v[1] * holeOrientation.v,
      v[2] * holeOrientation.v,
    ]);

    const hSign =
      hWorld[0] * cameraRight.x + hWorld[1] * cameraRight.y + hWorld[2] * cameraRight.z >= 0
        ? 1
        : -1;
    const vSign =
      vWorld[0] * cameraUp.x + vWorld[1] * cameraUp.y + vWorld[2] * cameraUp.z >= 0 ? 1 : -1;

    return { h: hSign, v: vSign };
  }

  function getShuttleScreenOrientation(frontNormalWorld) {
    const candidates = [];
    for (const armAxisLocal of SHUTTLE_ARM_AXES) {
      const armWorld = applyMatrixToVector(orientation, armAxisLocal);
      if (Math.abs(dotArray(armWorld, frontNormalWorld)) > 0.6) {
        continue;
      }
      const rightScore =
        armWorld[0] * cameraRight.x + armWorld[1] * cameraRight.y + armWorld[2] * cameraRight.z;
      const upScore = armWorld[0] * cameraUp.x + armWorld[1] * cameraUp.y + armWorld[2] * cameraUp.z;
      candidates.push({ rightScore, upScore });
    }

    if (candidates.length !== 2) {
      return null;
    }

    let hIdx = Math.abs(candidates[0].rightScore) >= Math.abs(candidates[1].rightScore) ? 0 : 1;
    let vIdx = Math.abs(candidates[0].upScore) >= Math.abs(candidates[1].upScore) ? 0 : 1;
    if (hIdx === vIdx) {
      vIdx = hIdx === 0 ? 1 : 0;
    }

    const h = candidates[hIdx].rightScore >= 0 ? 1 : -1;
    const v = candidates[vIdx].upScore >= 0 ? 1 : -1;

    return { h, v };
  }

  function getAlignmentProbe() {
    const candidates = getWallCandidates();
    if (candidates.length === 0) {
      return null;
    }

    let fallbackProbe = null;

    for (const wall of candidates) {
      const wallState = maze.rooms[currentRoomId].walls[wall.wallKey];
      const shuttleScreenOrientation = getShuttleScreenOrientation(wall.normalWorld);
      const holeScreenOrientation =
        wallState && wallState.type !== 'NONE' && wallState.orientation
          ? getHoleScreenOrientation(currentRoomId, wall.wallKey, wallState.orientation)
          : null;

      const aligned =
        shuttleScreenOrientation !== null &&
        holeScreenOrientation !== null &&
        holeScreenOrientation.h === shuttleScreenOrientation.h &&
        holeScreenOrientation.v === shuttleScreenOrientation.v;

      const probe = {
        frontWall: wall,
        wallState,
        shuttleScreenOrientation,
        holeScreenOrientation,
        aligned,
        canTraverse: aligned,
      };

      if (!fallbackProbe) {
        fallbackProbe = probe;
      }
      if (aligned) {
        return probe;
      }
    }

    return fallbackProbe;
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

    const targetMatrix = rotateWorld(orientation, axis, direction);

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
      return;
    }

    const wallState = probe.wallState;
    const isExit = wallState.type === 'EXIT';

    // Room meshes are transformed in roomRig local space, so traversal direction
    // must also be local to avoid double-rotation artifacts.
    const travelDir = new THREE.Vector3(
      probe.frontWall.normalLocal[0],
      probe.frontWall.normalLocal[1],
      probe.frontWall.normalLocal[2],
    ).normalize();
    const travelDistance = ROOM_HALF_SIZE;

    let nextMesh = null;
    if (!isExit) {
      nextMesh = roomMeshes.get(wallState.toRoomId);
      if (nextMesh.parent) {
        nextMesh.parent.remove(nextMesh);
      }
      nextMesh.position.set(0, 0, 0);
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
      orientation = rotationAnim.targetMatrix;
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
        roomRig.remove(traverseAnim.currentMesh);
        traverseAnim.currentMesh.position.set(0, 0, 0);

        activeRoomMesh = traverseAnim.nextMesh;
        currentRoomId = traverseAnim.toRoomId;
        traverseAnim.nextMesh.position
          .copy(traverseAnim.travelDir)
          .multiplyScalar(traverseAnim.travelDistance);
        roomRig.add(traverseAnim.nextMesh);
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

  syncShuttleRotation();
  updateRoomFog(currentRoomId);
  syncOverlay();

  function update(dtSeconds) {
    const dtMs = Math.max(0, dtSeconds * 1000);

    updateRotation(dtMs);
    updateTraversal(dtMs);
    syncShuttleRotation();

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
      orientationSignature: matrixSignature(orientation),
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
