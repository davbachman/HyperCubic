import {
  canonicalWallPair,
  EXIT_ROOM_ID,
  getAllDirectedWalls,
  getNeighbor,
  getTraversalTransportMatrix,
  getWallsForRoom,
  ROOM_IDS,
} from './topology.js';
import {
  evaluateMaze,
  getReciprocalHoleOrientationForTraversal,
  getShuttleWallOrientation,
} from './mazeEvaluator.js';
import { IDENTITY_MATRIX, multiplyMatrices } from './orientation.js';

/** @typedef {'NORMAL'|'EXIT'|'NONE'} HoleType */
/** @typedef {{h: -1|1, v: -1|1}} HoleOrientation */
/** @typedef {{ targetSteps?: number, fallbackSteps?: number, timeBudgetMs?: number, preferHolonomy?: boolean, optimizeStartAndExit?: boolean, forceConstructiveFallback?: boolean }} MazeGenerationConfig */
/** @typedef {{ seed?: number, generation?: MazeGenerationConfig }} GenerateMazeOptions */

const START_ROOM_IDS = ROOM_IDS.filter((roomId) => roomId !== EXIT_ROOM_ID);
const EXIT_WALL_KEYS = getWallsForRoom(EXIT_ROOM_ID);
const ORIENTATION_BY_CODE = [
  { h: -1, v: -1 },
  { h: -1, v: 1 },
  { h: 1, v: -1 },
  { h: 1, v: 1 },
];
const DEFAULT_GENERATION_CONFIG = Object.freeze({
  targetSteps: 22,
  fallbackSteps: 16,
  timeBudgetMs: 300,
  preferHolonomy: true,
  optimizeStartAndExit: true,
  forceConstructiveFallback: false,
});

const UNDIRECTED_WALL_PAIRS = [];
{
  const handledPairs = new Set();
  for (const { roomId, wallKey } of getAllDirectedWalls()) {
    const neighbor = getNeighbor(roomId, wallKey);
    const pairKey = canonicalWallPair(roomId, wallKey, neighbor.roomId, neighbor.wallKey);
    if (handledPairs.has(pairKey)) {
      continue;
    }
    handledPairs.add(pairKey);
    UNDIRECTED_WALL_PAIRS.push({
      pairKey,
      aRoomId: roomId,
      aWallKey: wallKey,
      bRoomId: neighbor.roomId,
      bWallKey: neighbor.wallKey,
    });
  }
}

function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomChoice(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

function randomInt(minInclusive, maxExclusive, rng) {
  return Math.floor(rng() * (maxExclusive - minInclusive)) + minInclusive;
}

function randomOrientationCode(rng) {
  return randomInt(0, 4, rng);
}

function orientationFromCode(code) {
  const orientation = ORIENTATION_BY_CODE[code];
  return {
    h: /** @type {-1|1} */ (orientation.h),
    v: /** @type {-1|1} */ (orientation.v),
  };
}

function sanitizeInt(value, fallbackValue, minimum = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallbackValue;
  }
  return Math.max(minimum, Math.floor(value));
}

function normalizeGenerationConfig(config) {
  const targetSteps = sanitizeInt(config?.targetSteps, DEFAULT_GENERATION_CONFIG.targetSteps, 1);
  const fallbackSteps = Math.min(
    targetSteps,
    sanitizeInt(config?.fallbackSteps, DEFAULT_GENERATION_CONFIG.fallbackSteps, 1),
  );
  return {
    targetSteps,
    fallbackSteps,
    timeBudgetMs: sanitizeInt(config?.timeBudgetMs, DEFAULT_GENERATION_CONFIG.timeBudgetMs, 1),
    preferHolonomy:
      typeof config?.preferHolonomy === 'boolean'
        ? config.preferHolonomy
        : DEFAULT_GENERATION_CONFIG.preferHolonomy,
    optimizeStartAndExit:
      typeof config?.optimizeStartAndExit === 'boolean'
        ? config.optimizeStartAndExit
        : DEFAULT_GENERATION_CONFIG.optimizeStartAndExit,
    forceConstructiveFallback:
      typeof config?.forceConstructiveFallback === 'boolean'
        ? config.forceConstructiveFallback
        : DEFAULT_GENERATION_CONFIG.forceConstructiveFallback,
  };
}

function candidateSignature(candidate) {
  let signature = `${candidate.startRoomId}|${candidate.exitWallKey}|`;
  for (let i = 0; i < candidate.orientationCodes.length; i += 1) {
    signature += String(candidate.orientationCodes[i]);
  }
  return signature;
}

function cloneCandidate(candidate) {
  return {
    startRoomId: candidate.startRoomId,
    exitWallKey: candidate.exitWallKey,
    orientationCodes: candidate.orientationCodes.slice(),
  };
}

function createCandidate(rng, lockedStartRoomId, lockedExitWallKey) {
  const orientationCodes = new Uint8Array(UNDIRECTED_WALL_PAIRS.length);
  for (let i = 0; i < orientationCodes.length; i += 1) {
    orientationCodes[i] = randomOrientationCode(rng);
  }

  return {
    startRoomId: lockedStartRoomId ?? randomChoice(START_ROOM_IDS, rng),
    exitWallKey: lockedExitWallKey ?? randomChoice(EXIT_WALL_KEYS, rng),
    orientationCodes,
  };
}

function mutateCandidate(candidate, rng, optimizeStartAndExit) {
  const next = cloneCandidate(candidate);
  const mutationCount = randomInt(1, 4, rng);

  const mutationKinds = optimizeStartAndExit ? ['A', 'B', 'C'] : ['A'];
  for (let mutation = 0; mutation < mutationCount; mutation += 1) {
    const kind = randomChoice(mutationKinds, rng);

    if (kind === 'A') {
      const pairIndex = randomInt(0, next.orientationCodes.length, rng);
      let nextCode = randomOrientationCode(rng);
      if (nextCode === next.orientationCodes[pairIndex]) {
        nextCode = (nextCode + 1 + randomInt(0, 3, rng)) % 4;
      }
      next.orientationCodes[pairIndex] = nextCode;
      continue;
    }

    if (kind === 'B') {
      if (START_ROOM_IDS.length > 1) {
        let roomId = randomChoice(START_ROOM_IDS, rng);
        if (roomId === next.startRoomId) {
          roomId = START_ROOM_IDS[(START_ROOM_IDS.indexOf(roomId) + 1 + randomInt(0, START_ROOM_IDS.length - 1, rng)) % START_ROOM_IDS.length];
        }
        next.startRoomId = roomId;
      }
      continue;
    }

    if (EXIT_WALL_KEYS.length > 1) {
      let wallKey = randomChoice(EXIT_WALL_KEYS, rng);
      if (wallKey === next.exitWallKey) {
        wallKey = EXIT_WALL_KEYS[(EXIT_WALL_KEYS.indexOf(wallKey) + 1 + randomInt(0, EXIT_WALL_KEYS.length - 1, rng)) % EXIT_WALL_KEYS.length];
      }
      next.exitWallKey = wallKey;
    }
  }

  return next;
}

function compareEvaluations(left, right, generationConfig) {
  if (left.metrics.solvable !== right.metrics.solvable) {
    return left.metrics.solvable ? -1 : 1;
  }

  const leftBucket =
    !left.metrics.solvable
      ? -1
      : left.metrics.shortestSteps >= generationConfig.targetSteps
        ? 2
        : left.metrics.shortestSteps >= generationConfig.fallbackSteps
          ? 1
          : 0;
  const rightBucket =
    !right.metrics.solvable
      ? -1
      : right.metrics.shortestSteps >= generationConfig.targetSteps
        ? 2
        : right.metrics.shortestSteps >= generationConfig.fallbackSteps
          ? 1
          : 0;
  if (leftBucket !== rightBucket) {
    return rightBucket - leftBucket;
  }

  const leftSteps = left.metrics.shortestSteps ?? -1;
  const rightSteps = right.metrics.shortestSteps ?? -1;
  if (leftSteps !== rightSteps) {
    return rightSteps - leftSteps;
  }

  if (generationConfig.preferHolonomy) {
    if (left.metrics.holonomyPreferenceScore !== right.metrics.holonomyPreferenceScore) {
      return right.metrics.holonomyPreferenceScore - left.metrics.holonomyPreferenceScore;
    }
  }

  if (left.metrics.goalPathMultiplicity !== right.metrics.goalPathMultiplicity) {
    return left.metrics.goalPathMultiplicity - right.metrics.goalPathMultiplicity;
  }

  if (left.metrics.reachableStateCount !== right.metrics.reachableStateCount) {
    return right.metrics.reachableStateCount - left.metrics.reachableStateCount;
  }

  return left.signature.localeCompare(right.signature);
}

function createRoomsFromCandidate(candidate) {
  const rooms = Object.fromEntries(
    ROOM_IDS.map((roomId) => [
      roomId,
      {
        walls: {},
      },
    ]),
  );

  const exitOrientation = getShuttleWallOrientation(EXIT_ROOM_ID, candidate.exitWallKey);
  if (!exitOrientation) {
    throw new Error(`No shuttle orientation available for exit wall ${candidate.exitWallKey}`);
  }

  for (let i = 0; i < UNDIRECTED_WALL_PAIRS.length; i += 1) {
    const pair = UNDIRECTED_WALL_PAIRS[i];
    const baseOrientation = orientationFromCode(candidate.orientationCodes[i]);

    const isExitSideA = pair.aRoomId === EXIT_ROOM_ID && pair.aWallKey === candidate.exitWallKey;
    const isExitSideB = pair.bRoomId === EXIT_ROOM_ID && pair.bWallKey === candidate.exitWallKey;

    if (isExitSideA || isExitSideB) {
      if (isExitSideA) {
        setWall(rooms, pair.aRoomId, pair.aWallKey, {
          type: 'EXIT',
          orientation: {
            h: exitOrientation.h,
            v: exitOrientation.v,
          },
          toRoomId: pair.bRoomId,
          toWallKey: pair.bWallKey,
        });
        setWall(rooms, pair.bRoomId, pair.bWallKey, {
          type: 'NONE',
          orientation: null,
          toRoomId: pair.aRoomId,
          toWallKey: pair.aWallKey,
        });
      } else {
        setWall(rooms, pair.aRoomId, pair.aWallKey, {
          type: 'NONE',
          orientation: null,
          toRoomId: pair.bRoomId,
          toWallKey: pair.bWallKey,
        });
        setWall(rooms, pair.bRoomId, pair.bWallKey, {
          type: 'EXIT',
          orientation: {
            h: exitOrientation.h,
            v: exitOrientation.v,
          },
          toRoomId: pair.aRoomId,
          toWallKey: pair.aWallKey,
        });
      }
      continue;
    }

    setWall(rooms, pair.aRoomId, pair.aWallKey, {
      type: 'NORMAL',
      orientation: baseOrientation,
      toRoomId: pair.bRoomId,
      toWallKey: pair.bWallKey,
    });

    const reciprocalOrientation = getReciprocalHoleOrientationForTraversal(
      pair.aRoomId,
      pair.aWallKey,
      baseOrientation,
    );
    setWall(rooms, pair.bRoomId, pair.bWallKey, {
      type: 'NORMAL',
      orientation: reciprocalOrientation,
      toRoomId: pair.aRoomId,
      toWallKey: pair.aWallKey,
    });
  }

  return rooms;
}

function evaluateCandidate(seed, candidate) {
  const maze = {
    seed,
    startRoomId: candidate.startRoomId,
    exit: {
      roomId: EXIT_ROOM_ID,
      wallKey: candidate.exitWallKey,
    },
    rooms: createRoomsFromCandidate(candidate),
  };

  return {
    metrics: evaluateMaze(maze),
    maze,
  };
}

function pickBest(records, generationConfig) {
  if (records.length === 0) {
    return null;
  }
  return [...records].sort((left, right) => compareEvaluations(left, right, generationConfig))[0];
}

function setWall(rooms, roomId, wallKey, value) {
  rooms[roomId].walls[wallKey] = value;
}

function roundSearchMs(searchStartedAt) {
  return Math.round((performance.now() - searchStartedAt) * 1000) / 1000;
}

function buildMazeResult(seed, maze, metrics, generationInfo) {
  return {
    seed,
    startRoomId: maze.startRoomId,
    exit: {
      roomId: EXIT_ROOM_ID,
      wallKey: maze.exit.wallKey,
    },
    rooms: maze.rooms,
    generationInfo: {
      targetStepsRequested: generationInfo.targetStepsRequested,
      targetStepsUsed: generationInfo.targetStepsUsed,
      shortestSteps: metrics.shortestSteps,
      holonomyPreferenceScore: metrics.holonomyPreferenceScore,
      reachableStateCount: metrics.reachableStateCount,
      goalPathMultiplicity: metrics.goalPathMultiplicity,
      searchMs: generationInfo.searchMs,
      clamped: generationInfo.clamped,
      evaluations: generationInfo.evaluations,
      candidatePoolSize: generationInfo.candidatePoolSize,
      strategy: generationInfo.strategy,
      searchExhausted: generationInfo.searchExhausted,
    },
  };
}

function chooseConstructiveTraverseSteps(startRoomId, exitWallKey, rng) {
  /** @type {{ roomId: string, wallKey: string }[]} */
  const steps = [];
  let currentRoomId = startRoomId;

  if (currentRoomId === EXIT_ROOM_ID) {
    throw new Error('Constructive fallback cannot start inside the exit room');
  }

  if (currentRoomId === 'W-' || currentRoomId === exitWallKey) {
    const intermediateOptions = getWallsForRoom(currentRoomId)
      .map((wallKey) => ({
        wallKey,
        toRoomId: getNeighbor(currentRoomId, wallKey).roomId,
      }))
      .filter(
        ({ toRoomId }) =>
          toRoomId !== EXIT_ROOM_ID && toRoomId !== 'W-' && toRoomId !== exitWallKey,
      );

    if (intermediateOptions.length === 0) {
      throw new Error(
        `Constructive fallback could not choose an intermediate room from ${currentRoomId}`,
      );
    }

    const chosen = randomChoice(intermediateOptions, rng);
    steps.push({
      roomId: currentRoomId,
      wallKey: chosen.wallKey,
    });
    currentRoomId = chosen.toRoomId;
  }

  if (currentRoomId === 'W-' || currentRoomId === EXIT_ROOM_ID || currentRoomId === exitWallKey) {
    throw new Error(
      `Constructive fallback could not stage a valid pre-exit room (got ${currentRoomId}, exit ${exitWallKey})`,
    );
  }

  steps.push({
    roomId: currentRoomId,
    wallKey: 'W+',
  });

  return steps;
}

function applyConstructiveGuaranteedPath(maze, rng) {
  const steps = chooseConstructiveTraverseSteps(maze.startRoomId, maze.exit.wallKey, rng);
  let currentRoomId = maze.startRoomId;
  let transportOrientation = [...IDENTITY_MATRIX];

  for (const step of steps) {
    if (step.roomId !== currentRoomId) {
      throw new Error(
        `Constructive fallback step room mismatch (expected ${currentRoomId}, got ${step.roomId})`,
      );
    }

    const wallState = maze.rooms[currentRoomId].walls[step.wallKey];
    if (!wallState || wallState.type !== 'NORMAL') {
      throw new Error(
        `Constructive fallback expected NORMAL wall at ${currentRoomId}:${step.wallKey}`,
      );
    }

    const alignedOrientation = getShuttleWallOrientation(
      currentRoomId,
      step.wallKey,
      transportOrientation,
    );
    if (!alignedOrientation) {
      throw new Error(
        `Constructive fallback could not compute shuttle orientation for ${currentRoomId}:${step.wallKey}`,
      );
    }

    wallState.orientation = alignedOrientation;
    const reciprocalOrientation = getReciprocalHoleOrientationForTraversal(
      currentRoomId,
      step.wallKey,
      alignedOrientation,
    );
    const reciprocalWall = maze.rooms[wallState.toRoomId].walls[wallState.toWallKey];
    if (!reciprocalWall || reciprocalWall.type !== 'NORMAL') {
      throw new Error(
        `Constructive fallback expected reciprocal NORMAL wall at ${wallState.toRoomId}:${wallState.toWallKey}`,
      );
    }
    reciprocalWall.orientation = reciprocalOrientation;

    transportOrientation = multiplyMatrices(
      transportOrientation,
      getTraversalTransportMatrix(currentRoomId, step.wallKey),
    );
    currentRoomId = wallState.toRoomId;
  }

  if (currentRoomId !== EXIT_ROOM_ID) {
    throw new Error(`Constructive fallback path failed to reach ${EXIT_ROOM_ID}`);
  }

  const exitWallState = maze.rooms[EXIT_ROOM_ID].walls[maze.exit.wallKey];
  if (!exitWallState || exitWallState.type !== 'EXIT') {
    throw new Error(
      `Constructive fallback expected EXIT wall at ${EXIT_ROOM_ID}:${maze.exit.wallKey}`,
    );
  }

  const exitOrientation = getShuttleWallOrientation(
    EXIT_ROOM_ID,
    maze.exit.wallKey,
    transportOrientation,
  );
  if (!exitOrientation) {
    throw new Error(
      `Constructive fallback could not compute exit orientation for ${EXIT_ROOM_ID}:${maze.exit.wallKey}`,
    );
  }
  exitWallState.orientation = exitOrientation;

  const exitReciprocal = maze.rooms[exitWallState.toRoomId].walls[exitWallState.toWallKey];
  if (!exitReciprocal || exitReciprocal.type !== 'NONE') {
    throw new Error(
      `Constructive fallback expected NONE reciprocal for ${EXIT_ROOM_ID}:${maze.exit.wallKey}`,
    );
  }
}

function buildConstructiveFallbackResult({
  seed,
  rng,
  generationConfig,
  lockedStartRoomId,
  lockedExitWallKey,
  evaluations,
  candidatePoolSize,
  searchStartedAt,
  searchExhausted,
}) {
  const candidate = createCandidate(rng, lockedStartRoomId, lockedExitWallKey);
  const maze = {
    seed,
    startRoomId: candidate.startRoomId,
    exit: {
      roomId: EXIT_ROOM_ID,
      wallKey: candidate.exitWallKey,
    },
    rooms: createRoomsFromCandidate(candidate),
  };

  applyConstructiveGuaranteedPath(maze, rng);

  const metrics = evaluateMaze(maze);
  if (!metrics.solvable) {
    throw new Error('Constructive fallback produced an unsolvable maze');
  }

  return buildMazeResult(seed, maze, metrics, {
    targetStepsRequested: generationConfig.targetSteps,
    targetStepsUsed: metrics.shortestSteps,
    clamped: true,
    evaluations,
    candidatePoolSize,
    searchMs: roundSearchMs(searchStartedAt),
    strategy: 'constructive-fallback',
    searchExhausted,
  });
}

/**
 * @param {GenerateMazeOptions} [options]
 */
export function generateMaze(options = {}) {
  const seed =
    typeof options.seed === 'number'
      ? options.seed >>> 0
      : Math.floor(Math.random() * 0xffffffff) >>> 0;
  const rng = createRng(seed);
  const generationConfig = normalizeGenerationConfig(options.generation);
  const searchStartedAt = performance.now();

  const lockedStartRoomId = generationConfig.optimizeStartAndExit ? null : randomChoice(START_ROOM_IDS, rng);
  const lockedExitWallKey = generationConfig.optimizeStartAndExit ? null : randomChoice(EXIT_WALL_KEYS, rng);

  if (generationConfig.forceConstructiveFallback) {
    return buildConstructiveFallbackResult({
      seed,
      rng,
      generationConfig,
      lockedStartRoomId,
      lockedExitWallKey,
      evaluations: 0,
      candidatePoolSize: 0,
      searchStartedAt,
      searchExhausted: false,
    });
  }

  const maxEvaluations = Math.max(48, Math.floor(generationConfig.timeBudgetMs * 0.8));
  const initialPopulation = Math.min(maxEvaluations, 24);
  const beamWidth = 12;

  const bySignature = new Map();
  const evaluated = [];
  const beam = [];

  function evaluateAndStore(candidate) {
    const signature = candidateSignature(candidate);
    const existing = bySignature.get(signature);
    if (existing) {
      return existing;
    }

    const evaluation = evaluateCandidate(seed, candidate);
    const record = {
      signature,
      candidate,
      maze: evaluation.maze,
      metrics: evaluation.metrics,
    };
    bySignature.set(signature, record);
    evaluated.push(record);

    beam.push(record);
    beam.sort((left, right) => compareEvaluations(left, right, generationConfig));
    if (beam.length > beamWidth) {
      beam.length = beamWidth;
    }

    return record;
  }

  let evaluations = 0;
  function evaluateCandidateBudgeted(candidate) {
    const before = bySignature.size;
    const record = evaluateAndStore(candidate);
    if (bySignature.size > before) {
      evaluations += 1;
    }
    return record;
  }

  while (evaluations < initialPopulation) {
    const candidate = createCandidate(rng, lockedStartRoomId, lockedExitWallKey);
    evaluateCandidateBudgeted(candidate);
  }

  let earlyStop = false;
  while (evaluations < maxEvaluations && !earlyStop) {
    const useRandom = beam.length === 0 || rng() < 0.2;
    const candidate = useRandom
      ? createCandidate(rng, lockedStartRoomId, lockedExitWallKey)
      : mutateCandidate(randomChoice(beam, rng).candidate, rng, generationConfig.optimizeStartAndExit);
    const record = evaluateCandidateBudgeted(candidate);
    if (
      record.metrics.solvable &&
      record.metrics.shortestSteps >= generationConfig.targetSteps &&
      (!generationConfig.preferHolonomy || record.metrics.holonomyPreferenceScore > 0)
    ) {
      earlyStop = true;
    }
  }

  let solved = evaluated.filter((record) => record.metrics.solvable);

  const fallbackAttempts = 4096;
  let attempts = 0;
  while (solved.length === 0 && attempts < fallbackAttempts) {
    const candidate = createCandidate(rng, lockedStartRoomId, lockedExitWallKey);
    const record = evaluateCandidateBudgeted(candidate);
    if (record.metrics.solvable) {
      solved = [record];
      break;
    }
    attempts += 1;
  }

  if (solved.length === 0) {
    return buildConstructiveFallbackResult({
      seed,
      rng,
      generationConfig,
      lockedStartRoomId,
      lockedExitWallKey,
      evaluations,
      candidatePoolSize: bySignature.size,
      searchStartedAt,
      searchExhausted: true,
    });
  }

  const solvedByTarget = solved.filter((record) => record.metrics.shortestSteps >= generationConfig.targetSteps);
  const solvedByFallback = solved.filter(
    (record) =>
      record.metrics.shortestSteps >= generationConfig.fallbackSteps &&
      record.metrics.shortestSteps < generationConfig.targetSteps,
  );

  /** @type {{ record: any, targetStepsUsed: number, clamped: boolean }} */
  let selection;
  if (solvedByTarget.length > 0) {
    selection = {
      record: pickBest(solvedByTarget, generationConfig),
      targetStepsUsed: generationConfig.targetSteps,
      clamped: false,
    };
  } else if (solvedByFallback.length > 0) {
    selection = {
      record: pickBest(solvedByFallback, generationConfig),
      targetStepsUsed: generationConfig.fallbackSteps,
      clamped: true,
    };
  } else {
    const bestSolved = pickBest(solved, generationConfig);
    selection = {
      record: bestSolved,
      targetStepsUsed: bestSolved.metrics.shortestSteps,
      clamped: true,
    };
  }

  const chosen = selection.record;
  return buildMazeResult(seed, chosen.maze, chosen.metrics, {
    targetStepsRequested: generationConfig.targetSteps,
    targetStepsUsed: selection.targetStepsUsed,
    clamped: selection.clamped,
    evaluations,
    candidatePoolSize: bySignature.size,
    searchMs: roundSearchMs(searchStartedAt),
    strategy: 'search',
    searchExhausted: false,
  });
}
