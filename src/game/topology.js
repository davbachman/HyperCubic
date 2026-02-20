/** @typedef {'W+'|'W-'|'X+'|'X-'|'Y+'|'Y-'|'Z+'|'Z-'} RoomId */
/** @typedef {'W+'|'W-'|'X+'|'X-'|'Y+'|'Y-'|'Z+'|'Z-'} WallKey */

const AXES = ['W', 'X', 'Y', 'Z'];

const PAIR_TO_LOCAL_AXIS = {
  WX: 'X',
  YZ: 'X',
  WY: 'Y',
  XZ: 'Y',
  WZ: 'Z',
  XY: 'Z',
};

const LOCAL_AXIS_TO_VECTOR = {
  X: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
};

const LOCAL_AXES = ['X', 'Y', 'Z'];

export const ROOM_IDS = ['W+', 'W-', 'X+', 'X-', 'Y+', 'Y-', 'Z+', 'Z-'];

export const ROOM_COLORS = {
  'W+': { name: 'Red', hex: 0xff2238 },
  'W-': { name: 'Orange', hex: 0xff8a1f },
  'X+': { name: 'Yellow', hex: 0xffea2b },
  'X-': { name: 'Blue', hex: 0x2492ff },
  'Y+': { name: 'Green', hex: 0x3cff4c },
  'Y-': { name: 'Pink', hex: 0xff4fc7 },
  'Z+': { name: 'Purple', hex: 0xa53dff },
  'Z-': { name: 'Violet', hex: 0x7b4bff },
};

export const EXIT_ROOM_ID = 'W+';

export function parseRoomId(roomId) {
  if (!ROOM_IDS.includes(roomId)) {
    throw new Error(`Invalid room id: ${roomId}`);
  }
  return {
    fixedAxis: roomId[0],
    fixedSign: roomId[1] === '+' ? 1 : -1,
  };
}

export function parseWallKey(wallKey) {
  if (!AXES.includes(wallKey[0]) || !['+', '-'].includes(wallKey[1])) {
    throw new Error(`Invalid wall key: ${wallKey}`);
  }
  return {
    axis: wallKey[0],
    sign: wallKey[1] === '+' ? 1 : -1,
  };
}

export function makeWallKey(axis, sign) {
  return `${axis}${sign >= 0 ? '+' : '-'}`;
}

export function getWallsForRoom(roomId) {
  const { fixedAxis } = parseRoomId(roomId);
  const wallAxes = AXES.filter((axis) => axis !== fixedAxis);
  return wallAxes.flatMap((axis) => [`${axis}+`, `${axis}-`]);
}

export function getNeighbor(roomId, wallKey) {
  const { fixedAxis, fixedSign } = parseRoomId(roomId);
  const { axis, sign } = parseWallKey(wallKey);
  if (axis === fixedAxis) {
    throw new Error(`Wall ${wallKey} is not valid for room ${roomId}`);
  }
  return {
    roomId: `${axis}${sign > 0 ? '+' : '-'}`,
    wallKey: `${fixedAxis}${fixedSign > 0 ? '+' : '-'}`,
  };
}

export function getAllDirectedWalls() {
  const out = [];
  for (const roomId of ROOM_IDS) {
    for (const wallKey of getWallsForRoom(roomId)) {
      out.push({ roomId, wallKey });
    }
  }
  return out;
}

function pairKey(a, b) {
  return a < b ? `${a}${b}` : `${b}${a}`;
}

function antiSymmetricPairSign(a, b) {
  return AXES.indexOf(a) < AXES.indexOf(b) ? 1 : -1;
}

function transpose3(matrix) {
  return [
    matrix[0], matrix[3], matrix[6],
    matrix[1], matrix[4], matrix[7],
    matrix[2], matrix[5], matrix[8],
  ];
}

function getRoomAxisMaps(roomId) {
  const { fixedAxis, fixedSign } = parseRoomId(roomId);
  const ambientToLocal = {};
  const localToAmbient = new Array(3).fill(null);

  for (const axis of AXES) {
    if (axis === fixedAxis) {
      continue;
    }

    const localAxis = PAIR_TO_LOCAL_AXIS[pairKey(fixedAxis, axis)];
    const localIndex = LOCAL_AXES.indexOf(localAxis);
    const sign = fixedSign * antiSymmetricPairSign(fixedAxis, axis);

    ambientToLocal[axis] = { localIndex, sign };
    localToAmbient[localIndex] = { axis, sign };
  }

  return { ambientToLocal, localToAmbient };
}

export function getWallVector(roomId, wallKey) {
  const { fixedAxis, fixedSign } = parseRoomId(roomId);
  const { axis, sign } = parseWallKey(wallKey);

  const localAxis = PAIR_TO_LOCAL_AXIS[pairKey(fixedAxis, axis)];
  if (!localAxis) {
    throw new Error(`No local axis mapping for pair ${fixedAxis}-${axis}`);
  }

  const wallSign = sign * fixedSign * antiSymmetricPairSign(fixedAxis, axis);
  const unit = LOCAL_AXIS_TO_VECTOR[localAxis];
  return [unit[0] * wallSign, unit[1] * wallSign, unit[2] * wallSign];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function getWallBasis(roomId, wallKey) {
  const normal = getWallVector(roomId, wallKey);
  const upRef = Math.abs(normal[1]) === 1 ? [0, 0, 1] : [0, 1, 0];
  const u = cross(upRef, normal);
  const v = cross(normal, u);
  return {
    normal,
    u,
    v,
  };
}

/**
 * Matrix that maps destination-room local vectors into source-room local vectors.
 * When crossing from `roomId` through `wallKey`, apply this on the right:
 *   nextFrame = currentFrame * matrix
 */
export function getTraversalTransportMatrix(roomId, wallKey) {
  const { fixedAxis, fixedSign } = parseRoomId(roomId);
  const { axis: wallAxis, sign: wallSign } = parseWallKey(wallKey);

  if (wallAxis === fixedAxis) {
    throw new Error(`Wall ${wallKey} is not valid for room ${roomId}`);
  }

  const neighbor = getNeighbor(roomId, wallKey);
  const sourceMaps = getRoomAxisMaps(roomId);
  const destinationMaps = getRoomAxisMaps(neighbor.roomId);

  const transportParity = fixedSign * wallSign;
  const out = new Array(9).fill(0);

  for (let destLocalIndex = 0; destLocalIndex < 3; destLocalIndex += 1) {
    const sourceAmbient = destinationMaps.localToAmbient[destLocalIndex];

    let transportedAxis = sourceAmbient.axis;
    let transportedSign = sourceAmbient.sign;

    // Inverse of the quarter-turn transport in the source fixed-axis / wall-axis plane.
    if (transportedAxis === fixedAxis) {
      transportedAxis = wallAxis;
      transportedSign *= -transportParity;
    } else if (transportedAxis === wallAxis) {
      transportedAxis = fixedAxis;
      transportedSign *= transportParity;
    }

    const mapped = sourceMaps.ambientToLocal[transportedAxis];
    const localSign = transportedSign * mapped.sign;
    out[mapped.localIndex * 3 + destLocalIndex] = localSign;
  }

  return out;
}

export function invertOrthonormalMatrix(matrix) {
  return transpose3(matrix);
}

export function canonicalWallPair(aRoomId, aWallKey, bRoomId, bWallKey) {
  const left = `${aRoomId}:${aWallKey}`;
  const right = `${bRoomId}:${bWallKey}`;
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}
