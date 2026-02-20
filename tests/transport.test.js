import { describe, expect, it } from 'vitest';

import {
  ROOM_IDS,
  getNeighbor,
  getTraversalTransportMatrix,
  getWallVector,
  getWallsForRoom,
} from '../src/game/topology.js';
import {
  IDENTITY_MATRIX,
  applyMatrixToVector,
  matrixSignature,
  multiplyMatrices,
  rotateWorld,
} from '../src/game/orientation.js';

function allViewOrientations() {
  const queue = [[...IDENTITY_MATRIX]];
  const seen = new Set();
  const out = [];

  while (queue.length > 0) {
    const matrix = queue.shift();
    const signature = matrixSignature(matrix);
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    out.push(matrix);

    queue.push(rotateWorld(matrix, 'x', 1));
    queue.push(rotateWorld(matrix, 'x', -1));
    queue.push(rotateWorld(matrix, 'y', 1));
    queue.push(rotateWorld(matrix, 'y', -1));
  }

  return out;
}

function getFrontWall(roomId, effectiveOrientation) {
  let best = null;

  for (const wallKey of getWallsForRoom(roomId)) {
    const normalLocal = getWallVector(roomId, wallKey);
    const normalWorld = applyMatrixToVector(effectiveOrientation, normalLocal);
    const forwardDot = normalWorld[2];
    if (forwardDot <= 0.05) {
      continue;
    }
    if (!best || forwardDot > best.forwardDot) {
      best = { wallKey, forwardDot };
    }
  }

  if (!best) {
    throw new Error(`No front wall found for ${roomId}`);
  }

  return best.wallKey;
}

function stepForward(state) {
  const effectiveOrientation = multiplyMatrices(state.viewOrientation, state.transportOrientation);
  const wallKey = getFrontWall(state.roomId, effectiveOrientation);
  const neighbor = getNeighbor(state.roomId, wallKey);
  const transportStep = getTraversalTransportMatrix(state.roomId, wallKey);

  return {
    roomId: neighbor.roomId,
    viewOrientation: state.viewOrientation,
    transportOrientation: multiplyMatrices(state.transportOrientation, transportStep),
  };
}

describe('transport', () => {
  it('cancels on reciprocal crossings', () => {
    for (const roomId of ROOM_IDS) {
      for (const wallKey of getWallsForRoom(roomId)) {
        const step = getTraversalTransportMatrix(roomId, wallKey);
        const neighbor = getNeighbor(roomId, wallKey);
        const reciprocal = getTraversalTransportMatrix(neighbor.roomId, neighbor.wallKey);
        const combined = multiplyMatrices(step, reciprocal);
        expect(combined).toEqual(IDENTITY_MATRIX);
      }
    }
  });

  it('returns to start room for F, L, F, L, F', () => {
    const views = allViewOrientations();

    for (const startRoomId of ROOM_IDS) {
      for (const startView of views) {
        let state = {
          roomId: startRoomId,
          viewOrientation: [...startView],
          transportOrientation: [...IDENTITY_MATRIX],
        };

        state = stepForward(state);
        state = {
          ...state,
          viewOrientation: rotateWorld(state.viewOrientation, 'y', -1),
        };
        state = stepForward(state);
        state = {
          ...state,
          viewOrientation: rotateWorld(state.viewOrientation, 'y', -1),
        };
        state = stepForward(state);

        expect(state.roomId).toBe(startRoomId);
      }
    }
  });
});
