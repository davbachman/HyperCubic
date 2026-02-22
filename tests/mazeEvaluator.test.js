import { describe, expect, it } from 'vitest';

import { evaluateMaze, getFrontWallForState, getShuttleWallOrientation, applyTraverseTransport } from '../src/game/mazeEvaluator.js';
import { IDENTITY_MATRIX, matrixSignature } from '../src/game/orientation.js';
import {
  canonicalWallPair,
  EXIT_ROOM_ID,
  getAllDirectedWalls,
  getNeighbor,
  getTraversalTransportMatrix,
  getWallsForRoom,
  ROOM_IDS,
} from '../src/game/topology.js';

function mirrorOrientationHorizontal(orientation) {
  return {
    h: /** @type {-1|1} */ (-orientation.h),
    v: orientation.v,
  };
}

function setWall(rooms, roomId, wallKey, value) {
  rooms[roomId].walls[wallKey] = value;
}

function buildUniformMaze({ startRoomId, exitWallKey, normalOrientation, exitOrientation }) {
  const rooms = Object.fromEntries(
    ROOM_IDS.map((roomId) => [
      roomId,
      {
        walls: {},
      },
    ]),
  );

  const handledPairs = new Set();
  for (const { roomId, wallKey } of getAllDirectedWalls()) {
    const neighbor = getNeighbor(roomId, wallKey);
    const pair = canonicalWallPair(roomId, wallKey, neighbor.roomId, neighbor.wallKey);
    if (handledPairs.has(pair)) {
      continue;
    }
    handledPairs.add(pair);

    const isExitSideA = roomId === EXIT_ROOM_ID && wallKey === exitWallKey;
    const isExitSideB = neighbor.roomId === EXIT_ROOM_ID && neighbor.wallKey === exitWallKey;

    if (isExitSideA || isExitSideB) {
      if (isExitSideA) {
        setWall(rooms, roomId, wallKey, {
          type: 'EXIT',
          orientation: {
            h: exitOrientation.h,
            v: exitOrientation.v,
          },
          toRoomId: neighbor.roomId,
          toWallKey: neighbor.wallKey,
        });
        setWall(rooms, neighbor.roomId, neighbor.wallKey, {
          type: 'NONE',
          orientation: null,
          toRoomId: roomId,
          toWallKey: wallKey,
        });
      } else {
        setWall(rooms, roomId, wallKey, {
          type: 'NONE',
          orientation: null,
          toRoomId: neighbor.roomId,
          toWallKey: neighbor.wallKey,
        });
        setWall(rooms, neighbor.roomId, neighbor.wallKey, {
          type: 'EXIT',
          orientation: {
            h: exitOrientation.h,
            v: exitOrientation.v,
          },
          toRoomId: roomId,
          toWallKey: wallKey,
        });
      }
      continue;
    }

    setWall(rooms, roomId, wallKey, {
      type: 'NORMAL',
      orientation: normalOrientation,
      toRoomId: neighbor.roomId,
      toWallKey: neighbor.wallKey,
    });

    setWall(rooms, neighbor.roomId, neighbor.wallKey, {
      type: 'NORMAL',
      orientation: mirrorOrientationHorizontal(normalOrientation),
      toRoomId: roomId,
      toWallKey: wallKey,
    });
  }

  return {
    seed: 1,
    startRoomId,
    exit: {
      roomId: EXIT_ROOM_ID,
      wallKey: exitWallKey,
    },
    rooms,
  };
}

describe('maze evaluator', () => {
  it('selects the same front wall as runtime camera-facing rule', () => {
    const frontWall = getFrontWallForState('W+', IDENTITY_MATRIX, IDENTITY_MATRIX);
    expect(frontWall).toBe('Z+');
  });

  it('returns hand-verified shortest solutions in tiny cases', () => {
    const exitOrientationAtZ = getShuttleWallOrientation('W+', 'Z+');
    const onePressMaze = buildUniformMaze({
      startRoomId: 'W+',
      exitWallKey: 'Z+',
      normalOrientation: { h: 1, v: 1 },
      exitOrientation: exitOrientationAtZ,
    });
    const onePressEval = evaluateMaze(onePressMaze);
    expect(onePressEval.solvable).toBe(true);
    expect(onePressEval.shortestSteps).toBe(1);

    const exitOrientationAtX = getShuttleWallOrientation('W+', 'X+');
    const twoPressMaze = buildUniformMaze({
      startRoomId: 'W+',
      exitWallKey: 'X+',
      normalOrientation: { h: 1, v: 1 },
      exitOrientation: exitOrientationAtX,
    });
    const twoPressEval = evaluateMaze(twoPressMaze);
    expect(twoPressEval.solvable).toBe(true);
    expect(twoPressEval.shortestSteps).toBe(2);
  });

  it('updates transport orientation when applying a traversal transition', () => {
    const nextState = applyTraverseTransport(
      {
        roomId: 'W+',
        viewOrientation: IDENTITY_MATRIX,
        transportOrientation: IDENTITY_MATRIX,
      },
      'Z+',
    );

    const expected = getTraversalTransportMatrix('W+', 'Z+');
    expect(matrixSignature(nextState.transportOrientation)).toBe(matrixSignature(expected));
    expect(nextState.transportOrientation).not.toEqual(IDENTITY_MATRIX);
  });

  it('computes shuttle orientation in the transported frame', () => {
    const transport = getTraversalTransportMatrix('W+', 'Z+');
    const roomId = 'Z+';
    const changedWall = getWallsForRoom(roomId).find((wallKey) => {
      const identityOrientation = getShuttleWallOrientation(roomId, wallKey, IDENTITY_MATRIX);
      const transportedOrientation = getShuttleWallOrientation(roomId, wallKey, transport);
      return (
        identityOrientation !== null &&
        transportedOrientation !== null &&
        (identityOrientation.h !== transportedOrientation.h || identityOrientation.v !== transportedOrientation.v)
      );
    });

    expect(changedWall).toBeDefined();
  });

  it('requires aligned EXIT orientation before the final Space can win', () => {
    const alignedExitOrientation = getShuttleWallOrientation('W+', 'Z+');
    const solvableMaze = buildUniformMaze({
      startRoomId: 'W+',
      exitWallKey: 'Z+',
      normalOrientation: { h: 1, v: 1 },
      exitOrientation: alignedExitOrientation,
    });
    expect(evaluateMaze(solvableMaze).solvable).toBe(true);

    const unsolvedMaze = buildUniformMaze({
      startRoomId: 'W+',
      exitWallKey: 'Z+',
      normalOrientation: { h: 1, v: 1 },
      exitOrientation: {
        h: /** @type {-1|1} */ (-alignedExitOrientation.h),
        v: alignedExitOrientation.v,
      },
    });
    expect(evaluateMaze(unsolvedMaze).solvable).toBe(false);
  });
});
