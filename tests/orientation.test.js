import { describe, expect, it } from 'vitest';

import {
  IDENTITY_MATRIX,
  applyMatrixToVector,
  rotateWorld,
} from '../src/game/orientation.js';

describe('orientation math', () => {
  it('returns to identity after four quarter-turns on same axis', () => {
    let matrix = [...IDENTITY_MATRIX];
    for (let i = 0; i < 4; i += 1) {
      matrix = rotateWorld(matrix, 'y', 1);
    }
    expect(matrix).toEqual(IDENTITY_MATRIX);
  });

  it('rotates axis vectors as expected around X and Y', () => {
    const xTurn = rotateWorld(IDENTITY_MATRIX, 'x', 1);
    const yVector = applyMatrixToVector(xTurn, [0, 1, 0]);
    expect(yVector).toEqual([0, 0, 1]);

    const yTurn = rotateWorld(IDENTITY_MATRIX, 'y', -1);
    const zVector = applyMatrixToVector(yTurn, [0, 0, 1]);
    expect(zVector).toEqual([-1, 0, 0]);
  });
});
