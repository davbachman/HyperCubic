import { describe, expect, it } from 'vitest';

import {
  ROOM_COLORS,
  ROOM_IDS,
  getNeighbor,
  getWallVector,
  getWallsForRoom,
} from '../src/game/topology.js';

describe('topology', () => {
  it('has reciprocal neighbors on every directed wall edge', () => {
    for (const roomId of ROOM_IDS) {
      for (const wallKey of getWallsForRoom(roomId)) {
        const next = getNeighbor(roomId, wallKey);
        const back = getNeighbor(next.roomId, next.wallKey);
        expect(back.roomId).toBe(roomId);
        expect(back.wallKey).toBe(wallKey);
      }
    }
  });

  it('assigns opposite wall vectors to reciprocal walls', () => {
    for (const roomId of ROOM_IDS) {
      for (const wallKey of getWallsForRoom(roomId)) {
        const next = getNeighbor(roomId, wallKey);
        const a = getWallVector(roomId, wallKey);
        const b = getWallVector(next.roomId, next.wallKey);
        expect(b[0]).toBe(-a[0]);
        expect(b[1]).toBe(-a[1]);
        expect(b[2]).toBe(-a[2]);
      }
    }
  });

  it('uses six unique walls and unique named colors across eight rooms', () => {
    const colorNames = new Set(Object.values(ROOM_COLORS).map((entry) => entry.name));
    expect(colorNames.size).toBe(8);

    for (const roomId of ROOM_IDS) {
      const walls = getWallsForRoom(roomId);
      expect(new Set(walls).size).toBe(6);
    }
  });
});
