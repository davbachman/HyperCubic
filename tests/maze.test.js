import { describe, expect, it } from 'vitest';

import { generateMaze } from '../src/game/maze.js';
import { evaluateMaze, getReciprocalHoleOrientationForTraversal } from '../src/game/mazeEvaluator.js';
import { EXIT_ROOM_ID, canonicalWallPair, getNeighbor, getWallsForRoom } from '../src/game/topology.js';

function expectInvariantSafeMaze(maze, { checkReciprocalNormals = false } = {}) {
  let exitCount = 0;
  let noneCount = 0;
  const seenPairs = new Set();

  for (const [roomId, room] of Object.entries(maze.rooms)) {
    for (const [wallKey, wall] of Object.entries(room.walls)) {
      const neighbor = getNeighbor(roomId, wallKey);
      expect(wall.toRoomId).toBe(neighbor.roomId);
      expect(wall.toWallKey).toBe(neighbor.wallKey);

      if (wall.type === 'EXIT') {
        exitCount += 1;
        expect(roomId).toBe(EXIT_ROOM_ID);
      }
      if (wall.type === 'NONE') {
        noneCount += 1;
      }

      if (!checkReciprocalNormals || wall.type !== 'NORMAL') {
        continue;
      }

      const pair = canonicalWallPair(roomId, wallKey, neighbor.roomId, neighbor.wallKey);
      if (seenPairs.has(pair)) {
        continue;
      }
      seenPairs.add(pair);

      const reciprocal = maze.rooms[neighbor.roomId].walls[neighbor.wallKey];
      expect(reciprocal.type).toBe('NORMAL');
      expect(reciprocal.orientation).toEqual(
        getReciprocalHoleOrientationForTraversal(roomId, wallKey, wall.orientation),
      );
    }
  }

  expect(exitCount).toBe(1);
  expect(noneCount).toBe(1);
  expect(maze.rooms[EXIT_ROOM_ID].walls[maze.exit.wallKey].type).toBe('EXIT');
}

function normalizeGenerationInfo(info) {
  return {
    ...info,
    searchMs: 0,
  };
}

describe('maze generation', () => {
  it('enforces a single one-way exit on red room side', () => {
    const maze = generateMaze({ seed: 12345 });

    expect(maze.exit.roomId).toBe(EXIT_ROOM_ID);
    expect(getWallsForRoom(EXIT_ROOM_ID)).toContain(maze.exit.wallKey);
    expect(maze.startRoomId).not.toBe(EXIT_ROOM_ID);

    let exitCount = 0;
    let noneCount = 0;

    for (const [roomId, room] of Object.entries(maze.rooms)) {
      for (const wall of Object.values(room.walls)) {
        if (wall.type === 'EXIT') {
          exitCount += 1;
          expect(roomId).toBe(EXIT_ROOM_ID);
        }
        if (wall.type === 'NONE') {
          noneCount += 1;
        }
      }
    }

    expect(exitCount).toBe(1);
    expect(noneCount).toBe(1);

    const exitWall = maze.rooms[EXIT_ROOM_ID].walls[maze.exit.wallKey];
    expect(exitWall.type).toBe('EXIT');

    const reciprocal = maze.rooms[exitWall.toRoomId].walls[exitWall.toWallKey];
    expect(reciprocal.type).toBe('NONE');
  });

  it('maps normal-hole orientations across reciprocal walls using transport-consistent reciprocity', () => {
    const maze = generateMaze({ seed: 9876 });
    const seenPairs = new Set();

    for (const [roomId, room] of Object.entries(maze.rooms)) {
      for (const [wallKey, wall] of Object.entries(room.walls)) {
        const next = getNeighbor(roomId, wallKey);
        const pair = canonicalWallPair(roomId, wallKey, next.roomId, next.wallKey);
        if (seenPairs.has(pair)) {
          continue;
        }
        seenPairs.add(pair);

        const reciprocal = maze.rooms[next.roomId].walls[next.wallKey];
        if (wall.type !== 'NORMAL') {
          continue;
        }

        expect(reciprocal.type).toBe('NORMAL');
        expect(reciprocal.orientation).toEqual(
          getReciprocalHoleOrientationForTraversal(roomId, wallKey, wall.orientation),
        );
      }
    }
  });

  it('keeps wall destinations consistent with tesseract topology', () => {
    const maze = generateMaze({ seed: 4242 });

    for (const [roomId, room] of Object.entries(maze.rooms)) {
      for (const [wallKey, wall] of Object.entries(room.walls)) {
        const neighbor = getNeighbor(roomId, wallKey);
        expect(wall.toRoomId).toBe(neighbor.roomId);
        expect(wall.toWallKey).toBe(neighbor.wallKey);
      }
    }
  });

  it('returns solvable mazes with generation diagnostics', () => {
    const seeds = [11, 33, 77, 121, 909];

    for (const seed of seeds) {
      const maze = generateMaze({ seed });
      const evaluation = evaluateMaze(maze);
      expect(evaluation.solvable).toBe(true);
      expect(maze.generationInfo.shortestSteps).toBe(evaluation.shortestSteps);
      expect(maze.generationInfo.shortestSteps).toBeGreaterThanOrEqual(maze.generationInfo.targetStepsUsed);
      expect(maze.generationInfo.targetStepsRequested).toBe(22);
      expect(typeof maze.generationInfo.searchMs).toBe('number');
      expect(maze.generationInfo.evaluations).toBeGreaterThan(0);
      expect(maze.generationInfo.strategy).toBe('search');
      expect(maze.generationInfo.searchExhausted).toBe(false);
    }
  });

  it('supports deterministic forced constructive fallback mazes', () => {
    const seed = 24681357;
    const a = generateMaze({
      seed,
      generation: {
        forceConstructiveFallback: true,
      },
    });
    const b = generateMaze({
      seed,
      generation: {
        forceConstructiveFallback: true,
      },
    });

    expect(a.startRoomId).toBe(b.startRoomId);
    expect(a.exit).toEqual(b.exit);
    expect(a.rooms).toEqual(b.rooms);
    expect(normalizeGenerationInfo(a.generationInfo)).toEqual(normalizeGenerationInfo(b.generationInfo));
    expect(a.generationInfo.strategy).toBe('constructive-fallback');
    expect(a.generationInfo.searchExhausted).toBe(false);
    expect(a.generationInfo.clamped).toBe(true);
  });

  it('returns invariant-safe solvable mazes under forced constructive fallback across seed samples', () => {
    const sampleCount = 20;

    for (let seed = 1; seed <= sampleCount; seed += 1) {
      const maze = generateMaze({
        seed,
        generation: {
          forceConstructiveFallback: true,
        },
      });
      const evaluation = evaluateMaze(maze);

      expect(evaluation.solvable).toBe(true);
      expect(maze.generationInfo.strategy).toBe('constructive-fallback');
      expect(maze.generationInfo.shortestSteps).toBe(evaluation.shortestSteps);
      expect(maze.generationInfo.targetStepsUsed).toBe(evaluation.shortestSteps);
      expect(maze.generationInfo.searchExhausted).toBe(false);

      expectInvariantSafeMaze(maze, { checkReciprocalNormals: true });
    }
  });

  it('applies fallback/clamp policy under constrained generation budgets', () => {
    const maze = generateMaze({
      seed: 2026,
      generation: {
        targetSteps: 40,
        fallbackSteps: 20,
        timeBudgetMs: 10,
      },
    });

    const info = maze.generationInfo;
    expect(info.targetStepsRequested).toBe(40);
    expect(info.shortestSteps).toBeGreaterThanOrEqual(info.targetStepsUsed);

    if (info.shortestSteps >= 40) {
      expect(info.targetStepsUsed).toBe(40);
      expect(info.clamped).toBe(false);
      return;
    }

    expect(info.clamped).toBe(true);
    if (info.shortestSteps >= 20) {
      expect(info.targetStepsUsed).toBe(20);
    } else {
      expect(info.targetStepsUsed).toBe(info.shortestSteps);
    }
  });

  it('startup smoke returns solvable mazes for a deterministic seed sample', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];

    for (const seed of seeds) {
      const maze = generateMaze({ seed });
      const evaluation = evaluateMaze(maze);
      expect(evaluation.solvable).toBe(true);
      expect(maze.generationInfo.shortestSteps).toBe(evaluation.shortestSteps);
    }
  });

  it(
    'stays solvable and invariant-safe across deterministic sample seeds',
    () => {
      const sampleCount = 12;
      let holonomyPositiveCount = 0;

      for (let seed = 1; seed <= sampleCount; seed += 1) {
        const maze = generateMaze({ seed });
        const evaluation = evaluateMaze(maze);
        expect(evaluation.solvable).toBe(true);
        expect(maze.generationInfo.strategy).toBe('search');

        if (evaluation.holonomyPreferenceScore > 0) {
          holonomyPositiveCount += 1;
        }

        expectInvariantSafeMaze(maze);
      }

      expect(holonomyPositiveCount).toBeGreaterThan(0);
    },
    30_000,
  );
});
