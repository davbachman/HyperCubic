import {
  getTraversalTransportMatrix,
  getWallBasis,
  getWallVector,
  getWallsForRoom,
  ROOM_IDS,
} from './topology.js';
import {
  IDENTITY_MATRIX,
  applyMatrixToVector,
  matrixSignature,
  multiplyMatrices,
  rotateWorld,
} from './orientation.js';

const DEFAULT_CAMERA_FORWARD = normalize([-0.88, -0.54, 2.72]);

const SHUTTLE_ARM_AXES = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

const ROOM_WALL_KEYS = Object.fromEntries(ROOM_IDS.map((roomId) => [roomId, getWallsForRoom(roomId)]));

const SHUTTLE_WALL_ORIENTATION_CACHE = new Map();

const VIEW_MATRICES = [];
const VIEW_SIGNATURE_TO_INDEX = new Map();
const VIEW_ROTATE_LEFT = [];
const VIEW_ROTATE_RIGHT = [];
const VIEW_ROTATE_UP = [];
const VIEW_ROTATE_DOWN = [];

{
  const queue = [[...IDENTITY_MATRIX]];
  while (queue.length > 0) {
    const matrix = queue.shift();
    const signature = matrixSignature(matrix);
    if (VIEW_SIGNATURE_TO_INDEX.has(signature)) {
      continue;
    }
    VIEW_SIGNATURE_TO_INDEX.set(signature, VIEW_MATRICES.length);
    VIEW_MATRICES.push(matrix);

    queue.push(rotateWorld(matrix, 'x', 1));
    queue.push(rotateWorld(matrix, 'x', -1));
    queue.push(rotateWorld(matrix, 'y', 1));
    queue.push(rotateWorld(matrix, 'y', -1));
  }
}

for (let i = 0; i < VIEW_MATRICES.length; i += 1) {
  const matrix = VIEW_MATRICES[i];
  VIEW_ROTATE_LEFT[i] = VIEW_SIGNATURE_TO_INDEX.get(matrixSignature(rotateWorld(matrix, 'y', -1)));
  VIEW_ROTATE_RIGHT[i] = VIEW_SIGNATURE_TO_INDEX.get(matrixSignature(rotateWorld(matrix, 'y', 1)));
  VIEW_ROTATE_UP[i] = VIEW_SIGNATURE_TO_INDEX.get(matrixSignature(rotateWorld(matrix, 'x', 1)));
  VIEW_ROTATE_DOWN[i] = VIEW_SIGNATURE_TO_INDEX.get(matrixSignature(rotateWorld(matrix, 'x', -1)));
}

const IDENTITY_VIEW_INDEX = VIEW_SIGNATURE_TO_INDEX.get(matrixSignature(IDENTITY_MATRIX));
const TRANSPORT_MATRIX_CACHE = new Map([[matrixSignature(IDENTITY_MATRIX), [...IDENTITY_MATRIX]]]);
const FRONT_WALL_CACHE = new Map();

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function dotArray(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function computeShuttleWallOrientation(roomId, wallKey, transportMatrix) {
  const { normal, u, v } = getWallBasis(roomId, wallKey);
  const normalInShuttleFrame = applyMatrixToVector(transportMatrix, normal);
  const uInShuttleFrame = applyMatrixToVector(transportMatrix, u);
  const vInShuttleFrame = applyMatrixToVector(transportMatrix, v);
  let h = 0;
  let vertical = 0;

  for (const armAxisLocal of SHUTTLE_ARM_AXES) {
    if (Math.abs(dotArray(armAxisLocal, normalInShuttleFrame)) > 0.6) {
      continue;
    }

    const hScore = dotArray(armAxisLocal, uInShuttleFrame);
    const vScore = dotArray(armAxisLocal, vInShuttleFrame);

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

function isDefaultCameraForward(cameraForward) {
  return (
    cameraForward[0] === DEFAULT_CAMERA_FORWARD[0] &&
    cameraForward[1] === DEFAULT_CAMERA_FORWARD[1] &&
    cameraForward[2] === DEFAULT_CAMERA_FORWARD[2]
  );
}

function getCachedTransportMatrix(matrix, signature) {
  const existing = TRANSPORT_MATRIX_CACHE.get(signature);
  if (existing) {
    return existing;
  }
  TRANSPORT_MATRIX_CACHE.set(signature, matrix);
  return matrix;
}

function getFrontWallForViewTransport(roomId, viewMatrix, transportMatrix, cameraForward) {
  const effectiveOrientation = multiplyMatrices(viewMatrix, transportMatrix);
  const wallKeys = ROOM_WALL_KEYS[roomId];
  let bestWallKey = null;
  let bestForwardDot = -Infinity;

  for (const wallKey of wallKeys) {
    const wallVector = getWallVector(roomId, wallKey);
    const wallNormalWorld = applyMatrixToVector(effectiveOrientation, wallVector);
    const forwardDot = dotArray(wallNormalWorld, cameraForward);
    if (forwardDot <= 0.05) {
      continue;
    }
    if (forwardDot > bestForwardDot) {
      bestForwardDot = forwardDot;
      bestWallKey = wallKey;
    }
  }

  return bestWallKey;
}

function getFrontWallForStateCached(roomId, viewIndex, transportMatrix, transportSignature, cameraForward) {
  if (!isDefaultCameraForward(cameraForward)) {
    return getFrontWallForViewTransport(roomId, VIEW_MATRICES[viewIndex], transportMatrix, cameraForward);
  }

  const cacheKey = `${roomId}|${viewIndex}|${transportSignature}`;
  const cached = FRONT_WALL_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const wallKey = getFrontWallForViewTransport(
    roomId,
    VIEW_MATRICES[viewIndex],
    transportMatrix,
    DEFAULT_CAMERA_FORWARD,
  );
  FRONT_WALL_CACHE.set(cacheKey, wallKey ?? null);
  return wallKey;
}

function makeStateKey(roomId, viewIndex, transportSignature) {
  return `${roomId}|${viewIndex}|${transportSignature}`;
}

/**
 * @param {{
 *  roomId: string,
 *  viewOrientation: number[],
 *  transportOrientation: number[],
 * }} state
 * @param {string} wallKey
 */
export function applyTraverseTransport(state, wallKey) {
  const transportStep = getTraversalTransportMatrix(state.roomId, wallKey);
  return {
    roomId: state.roomId,
    // Traverse does not change view orientation; only transport frame changes.
    viewOrientation: [...state.viewOrientation],
    transportOrientation: multiplyMatrices(state.transportOrientation, transportStep),
  };
}

export function getShuttleWallOrientation(roomId, wallKey, transportOrientation = IDENTITY_MATRIX) {
  const transportSignature = matrixSignature(transportOrientation);
  const cacheKey = `${roomId}:${wallKey}:${transportSignature}`;
  const cached = SHUTTLE_WALL_ORIENTATION_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const orientation = computeShuttleWallOrientation(roomId, wallKey, transportOrientation);
  SHUTTLE_WALL_ORIENTATION_CACHE.set(cacheKey, orientation);
  return orientation;
}

export function getFrontWallForState(roomId, viewOrientation, transportOrientation, cameraForward = DEFAULT_CAMERA_FORWARD) {
  return getFrontWallForViewTransport(roomId, viewOrientation, transportOrientation, cameraForward);
}

/**
 * @param {{
 *  startRoomId: string,
 *  rooms: Record<string, { walls: Record<string, { type: 'NORMAL'|'EXIT'|'NONE', orientation: {h:-1|1, v:-1|1}|null, toRoomId: string, toWallKey: string }> }>,
 * }} maze
 * @param {{ cameraForward?: number[] }} [options]
 */
export function evaluateMaze(maze, options = {}) {
  const cameraForward = options.cameraForward ?? DEFAULT_CAMERA_FORWARD;

  const states = [];
  const depths = [];
  const predecessors = [];
  const stateIndexByKey = new Map();

  const queue = [];
  let queueHead = 0;

  function getOrCreateState(roomId, viewIndex, transportMatrix, transportSignature) {
    const key = makeStateKey(roomId, viewIndex, transportSignature);
    const existing = stateIndexByKey.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const index = states.length;
    stateIndexByKey.set(key, index);
    states.push({
      roomId,
      viewIndex,
      transportMatrix,
      transportSignature,
    });
    depths.push(-1);
    predecessors.push([]);
    return index;
  }

  const identityTransportSignature = matrixSignature(IDENTITY_MATRIX);
  const startIndex = getOrCreateState(
    maze.startRoomId,
    IDENTITY_VIEW_INDEX,
    TRANSPORT_MATRIX_CACHE.get(identityTransportSignature),
    identityTransportSignature,
  );
  depths[startIndex] = 0;
  queue.push(startIndex);

  const goalStateIndices = [];
  let shortestGoalDepth = Infinity;

  while (queueHead < queue.length) {
    const stateIndex = queue[queueHead];
    queueHead += 1;
    const state = states[stateIndex];
    const depth = depths[stateIndex];
    const frontWallKey = getFrontWallForStateCached(
      state.roomId,
      state.viewIndex,
      state.transportMatrix,
      state.transportSignature,
      cameraForward,
    );

    if (!frontWallKey) {
      continue;
    }

    const wallState = maze.rooms[state.roomId].walls[frontWallKey];
    const shuttleOrientation = getShuttleWallOrientation(
      state.roomId,
      frontWallKey,
      state.transportMatrix,
    );
    const holeOrientation = wallState.type !== 'NONE' ? wallState.orientation : null;
    const aligned =
      shuttleOrientation !== null &&
      holeOrientation !== null &&
      shuttleOrientation.h === holeOrientation.h &&
      shuttleOrientation.v === holeOrientation.v;

    if (wallState.type === 'EXIT' && aligned) {
      goalStateIndices.push(stateIndex);
      shortestGoalDepth = Math.min(shortestGoalDepth, depth);
    }

    function connect(nextRoomId, nextViewIndex, nextTransportMatrix, nextTransportSignature) {
      const nextIndex = getOrCreateState(
        nextRoomId,
        nextViewIndex,
        nextTransportMatrix,
        nextTransportSignature,
      );
      predecessors[nextIndex].push(stateIndex);

      if (depths[nextIndex] === -1) {
        depths[nextIndex] = depth + 1;
        queue.push(nextIndex);
      }
    }

    connect(state.roomId, VIEW_ROTATE_LEFT[state.viewIndex], state.transportMatrix, state.transportSignature);
    connect(state.roomId, VIEW_ROTATE_RIGHT[state.viewIndex], state.transportMatrix, state.transportSignature);
    connect(state.roomId, VIEW_ROTATE_UP[state.viewIndex], state.transportMatrix, state.transportSignature);
    connect(state.roomId, VIEW_ROTATE_DOWN[state.viewIndex], state.transportMatrix, state.transportSignature);

    if (aligned && wallState.type === 'NORMAL') {
      const transportStep = getTraversalTransportMatrix(state.roomId, frontWallKey);
      const nextTransportMatrix = multiplyMatrices(state.transportMatrix, transportStep);
      const nextTransportSignature = matrixSignature(nextTransportMatrix);
      const cachedTransport = getCachedTransportMatrix(nextTransportMatrix, nextTransportSignature);
      connect(wallState.toRoomId, state.viewIndex, cachedTransport, nextTransportSignature);
    }
  }

  const solvable = goalStateIndices.length > 0;
  const reachableStateCount = states.length;
  if (!solvable) {
    return {
      solvable: false,
      shortestSteps: null,
      reachableStateCount,
      holonomyPreferenceScore: 0,
      goalPathMultiplicity: 0,
    };
  }

  const shortestGoalStates = goalStateIndices.filter((stateIndex) => depths[stateIndex] === shortestGoalDepth);
  const shortestSteps = shortestGoalDepth + 1;
  const goalPathMultiplicity = shortestGoalStates.length;

  const onPathToGoal = new Set(goalStateIndices);
  const reverseQueue = [...goalStateIndices];
  let reverseHead = 0;
  while (reverseHead < reverseQueue.length) {
    const stateIndex = reverseQueue[reverseHead];
    reverseHead += 1;
    for (const predecessorIndex of predecessors[stateIndex]) {
      if (onPathToGoal.has(predecessorIndex)) {
        continue;
      }
      onPathToGoal.add(predecessorIndex);
      reverseQueue.push(predecessorIndex);
    }
  }

  const transportVariantsByRoom = new Map();
  for (const stateIndex of onPathToGoal) {
    const state = states[stateIndex];
    if (!transportVariantsByRoom.has(state.roomId)) {
      transportVariantsByRoom.set(state.roomId, new Set());
    }
    transportVariantsByRoom.get(state.roomId).add(state.transportSignature);
  }

  let holonomyPreferenceScore = 0;
  for (const transportVariants of transportVariantsByRoom.values()) {
    holonomyPreferenceScore += Math.max(0, transportVariants.size - 1);
  }

  return {
    solvable: true,
    shortestSteps,
    reachableStateCount,
    holonomyPreferenceScore,
    goalPathMultiplicity,
  };
}

export function createMazeEvaluator(options = {}) {
  return {
    evaluateMaze(maze) {
      return evaluateMaze(maze, options);
    },
  };
}

export const evaluatorConstants = {
  CAMERA_FORWARD: DEFAULT_CAMERA_FORWARD,
  VIEW_COUNT: VIEW_MATRICES.length,
};
