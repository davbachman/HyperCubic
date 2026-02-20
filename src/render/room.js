import * as THREE from 'three';
import { ROOM_COLORS, getWallBasis, getWallsForRoom } from '../game/topology.js';
import { SHUTTLE_COLOR_HEX } from './shuttle.js';

export const ROOM_HALF_SIZE = 3;
export const ROOM_SIZE = ROOM_HALF_SIZE * 2;

const OUTER_WALL_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x030303,
  roughness: 0.88,
  metalness: 0.05,
  side: THREE.DoubleSide,
});

function toVector3(v) {
  return new THREE.Vector3(v[0], v[1], v[2]);
}

function makeOuterWallPath(size) {
  const half = size * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-half, -half);
  shape.lineTo(half, -half);
  shape.lineTo(half, half);
  shape.lineTo(-half, half);
  shape.lineTo(-half, -half);
  return shape;
}

function lPolygonPoints(orientation, armLength, armWidth) {
  const halfWidth = armWidth * 0.5;
  const base = [
    [-halfWidth, -halfWidth],
    [armLength, -halfWidth],
    [armLength, halfWidth],
    [halfWidth, halfWidth],
    [halfWidth, armLength],
    [-halfWidth, armLength],
  ];

  return base.map(([x, y]) => [x * orientation.h, y * orientation.v]);
}

function makeWallGeometry(size, orientation) {
  if (!orientation) {
    return new THREE.PlaneGeometry(size, size, 1, 1);
  }

  const shape = makeOuterWallPath(size);
  const armLength = size * 0.28;
  const armWidth = size * 0.14;
  const points = lPolygonPoints(orientation, armLength, armWidth);

  const hole = new THREE.Path();
  const reversed = [...points].reverse();
  hole.moveTo(reversed[0][0], reversed[0][1]);
  for (let i = 1; i < reversed.length; i += 1) {
    hole.lineTo(reversed[i][0], reversed[i][1]);
  }
  hole.lineTo(reversed[0][0], reversed[0][1]);
  shape.holes.push(hole);

  return new THREE.ShapeGeometry(shape);
}

function makeGlowSegment(start, end, color, radius = 0.04, opacity = 1) {
  const delta = end.clone().sub(start);
  const length = delta.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 10, 1, false);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}

function makeRoomEdgeGlow(color) {
  const group = new THREE.Group();
  const half = ROOM_HALF_SIZE - 0.02;

  const corners = [
    new THREE.Vector3(-half, -half, -half),
    new THREE.Vector3(half, -half, -half),
    new THREE.Vector3(half, half, -half),
    new THREE.Vector3(-half, half, -half),
    new THREE.Vector3(-half, -half, half),
    new THREE.Vector3(half, -half, half),
    new THREE.Vector3(half, half, half),
    new THREE.Vector3(-half, half, half),
  ];

  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  for (const [a, b] of edges) {
    group.add(makeGlowSegment(corners[a], corners[b], color, 0.03, 0.95));
    group.add(makeGlowSegment(corners[a], corners[b], color, 0.07, 0.22));
  }

  return group;
}

function makeHoleOutline(orientation, color, zOffset = 0.03) {
  const group = new THREE.Group();
  const points = lPolygonPoints(orientation, ROOM_SIZE * 0.28, ROOM_SIZE * 0.14);
  const pointVectors = points.map(([x, y]) => new THREE.Vector3(x, y, zOffset));
  pointVectors.push(pointVectors[0].clone());
  for (let i = 0; i < pointVectors.length - 1; i += 1) {
    // Two-pass outline preserves hue while still giving neon bloom.
    group.add(makeGlowSegment(pointVectors[i], pointVectors[i + 1], color, 0.028, 0.9));
    group.add(makeGlowSegment(pointVectors[i], pointVectors[i + 1], color, 0.055, 0.16));
  }
  return group;
}

function wallHoleColorHex(wallState) {
  if (wallState.type === 'EXIT') {
    return SHUTTLE_COLOR_HEX;
  }
  if (wallState.type === 'NORMAL') {
    return ROOM_COLORS[wallState.toRoomId].hex;
  }
  return null;
}

export function createRoomMesh(roomId, wallStates) {
  const room = new THREE.Group();
  room.name = `room-${roomId}`;

  const roomColorHex = ROOM_COLORS[roomId].hex;

  const edgeLines = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(ROOM_SIZE, ROOM_SIZE, ROOM_SIZE)),
    new THREE.LineBasicMaterial({
      color: roomColorHex,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  room.add(edgeLines);
  room.add(makeRoomEdgeGlow(roomColorHex));

  for (const wallKey of getWallsForRoom(roomId)) {
    const wallState = wallStates[wallKey];
    const { normal, u, v } = getWallBasis(roomId, wallKey);

    const wallGroup = new THREE.Group();
    wallGroup.name = `wall-${wallKey}`;

    const geometry = makeWallGeometry(ROOM_SIZE, wallState.orientation);
    const wallPanel = new THREE.Mesh(geometry, OUTER_WALL_MATERIAL);
    wallGroup.add(wallPanel);

    if (wallState.type !== 'NONE' && wallState.orientation) {
      const holeColor = wallHoleColorHex(wallState);
      wallGroup.add(makeHoleOutline(wallState.orientation, holeColor));
    }

    const uVec = toVector3(u);
    const vVec = toVector3(v);
    const nVec = toVector3(normal);
    const rotationMatrix = new THREE.Matrix4().makeBasis(uVec, vVec, nVec);
    wallGroup.quaternion.setFromRotationMatrix(rotationMatrix);
    wallGroup.position.copy(nVec.multiplyScalar(ROOM_HALF_SIZE - 0.001));

    room.add(wallGroup);
  }

  const railMaterial = new THREE.MeshBasicMaterial({
    color: 0xff2433,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
  });

  const railRadius = 0.04;
  const railLength = ROOM_SIZE;

  const railX = new THREE.Mesh(new THREE.CylinderGeometry(railRadius, railRadius, railLength, 14), railMaterial);
  railX.rotation.z = -Math.PI * 0.5;
  room.add(railX);

  const railY = new THREE.Mesh(new THREE.CylinderGeometry(railRadius, railRadius, railLength, 14), railMaterial);
  room.add(railY);

  const railZ = new THREE.Mesh(new THREE.CylinderGeometry(railRadius, railRadius, railLength, 14), railMaterial);
  railZ.rotation.x = Math.PI * 0.5;
  room.add(railZ);

  return room;
}
