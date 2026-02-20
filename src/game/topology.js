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

export function canonicalWallPair(aRoomId, aWallKey, bRoomId, bWallKey) {
  const left = `${aRoomId}:${aWallKey}`;
  const right = `${bRoomId}:${bWallKey}`;
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}
