import * as THREE from 'three';

export const IDENTITY_MATRIX = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];

const ROTATE_X_POS = [
  1, 0, 0,
  0, 0, -1,
  0, 1, 0,
];

const ROTATE_X_NEG = [
  1, 0, 0,
  0, 0, 1,
  0, -1, 0,
];

const ROTATE_Y_POS = [
  0, 0, 1,
  0, 1, 0,
  -1, 0, 0,
];

const ROTATE_Y_NEG = [
  0, 0, -1,
  0, 1, 0,
  1, 0, 0,
];

function getRotationMatrix(axis, direction) {
  if (axis === 'x') {
    return direction > 0 ? ROTATE_X_POS : ROTATE_X_NEG;
  }
  if (axis === 'y') {
    return direction > 0 ? ROTATE_Y_POS : ROTATE_Y_NEG;
  }
  throw new Error(`Unsupported axis: ${axis}`);
}

export function multiplyMatrices(a, b) {
  const out = new Array(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      out[row * 3 + col] =
        a[row * 3 + 0] * b[0 * 3 + col] +
        a[row * 3 + 1] * b[1 * 3 + col] +
        a[row * 3 + 2] * b[2 * 3 + col];
    }
  }
  return out;
}

export function rotateWorld(matrix, axis, direction) {
  return multiplyMatrices(getRotationMatrix(axis, direction), matrix);
}

export function applyMatrixToVector(matrix, vector) {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  ];
}

export function matrixToQuaternion(matrix) {
  const m4 = new THREE.Matrix4();
  m4.set(
    matrix[0], matrix[1], matrix[2], 0,
    matrix[3], matrix[4], matrix[5], 0,
    matrix[6], matrix[7], matrix[8], 0,
    0, 0, 0, 1,
  );
  const q = new THREE.Quaternion();
  q.setFromRotationMatrix(m4);
  return q;
}

export function matrixSignature(matrix) {
  return matrix.join(',');
}
