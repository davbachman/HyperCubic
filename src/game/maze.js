import {
  canonicalWallPair,
  EXIT_ROOM_ID,
  getAllDirectedWalls,
  getNeighbor,
  getWallsForRoom,
  ROOM_IDS,
} from './topology.js';

/** @typedef {'NORMAL'|'EXIT'|'NONE'} HoleType */
/** @typedef {{h: -1|1, v: -1|1}} HoleOrientation */

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

function randomOrientation(rng) {
  return {
    h: rng() < 0.5 ? -1 : 1,
    v: rng() < 0.5 ? -1 : 1,
  };
}

export function mirrorOrientationHorizontal(orientation) {
  return {
    h: /** @type {-1|1} */ (-orientation.h),
    v: orientation.v,
  };
}

function setWall(rooms, roomId, wallKey, value) {
  rooms[roomId].walls[wallKey] = value;
}

/**
 * @param {{ seed?: number }} [options]
 */
export function generateMaze(options = {}) {
  const seed =
    typeof options.seed === 'number'
      ? options.seed >>> 0
      : Math.floor(Math.random() * 0xffffffff) >>> 0;
  const rng = createRng(seed);

  const rooms = Object.fromEntries(
    ROOM_IDS.map((roomId) => [
      roomId,
      {
        walls: {},
      },
    ]),
  );

  const startCandidates = ROOM_IDS.filter((roomId) => roomId !== EXIT_ROOM_ID);
  const startRoomId = randomChoice(startCandidates, rng);
  const exitWallKey = randomChoice(getWallsForRoom(EXIT_ROOM_ID), rng);

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
    const baseOrientation = randomOrientation(rng);

    if (isExitSideA || isExitSideB) {
      if (isExitSideA) {
        setWall(rooms, roomId, wallKey, {
          type: 'EXIT',
          orientation: baseOrientation,
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
          orientation: baseOrientation,
          toRoomId: roomId,
          toWallKey: wallKey,
        });
      }
      continue;
    }

    setWall(rooms, roomId, wallKey, {
      type: 'NORMAL',
      orientation: baseOrientation,
      toRoomId: neighbor.roomId,
      toWallKey: neighbor.wallKey,
    });

    setWall(rooms, neighbor.roomId, neighbor.wallKey, {
      type: 'NORMAL',
      orientation: mirrorOrientationHorizontal(baseOrientation),
      toRoomId: roomId,
      toWallKey: wallKey,
    });
  }

  return {
    seed,
    startRoomId,
    exit: {
      roomId: EXIT_ROOM_ID,
      wallKey: exitWallKey,
    },
    rooms,
  };
}
