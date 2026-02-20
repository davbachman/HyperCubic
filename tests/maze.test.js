import { describe, expect, it } from 'vitest';

import { generateMaze } from '../src/game/maze.js';
import { EXIT_ROOM_ID, canonicalWallPair, getNeighbor, getWallsForRoom } from '../src/game/topology.js';

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

  it('mirrors normal-hole orientations across reciprocal walls', () => {
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
        expect(reciprocal.orientation.h).toBe(-wall.orientation.h);
        expect(reciprocal.orientation.v).toBe(wall.orientation.v);
      }
    }
  });
});
