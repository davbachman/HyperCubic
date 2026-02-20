import * as THREE from 'three';

export const SHUTTLE_COLOR_HEX = 0xf4fbff;

function makeArm(length, radius, axis) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 20, 1, false);
  const material = new THREE.MeshStandardMaterial({
    color: SHUTTLE_COLOR_HEX,
    emissive: 0xddeeff,
    emissiveIntensity: 0.95,
    metalness: 0.35,
    roughness: 0.15,
  });

  const arm = new THREE.Mesh(geometry, material);

  if (axis === 'x') {
    arm.rotation.z = -Math.PI / 2;
    arm.position.x = length * 0.5;
  } else if (axis === 'y') {
    arm.position.y = length * 0.5;
  } else if (axis === 'z') {
    arm.rotation.x = Math.PI / 2;
    arm.position.z = length * 0.5;
  }

  return arm;
}

function makeTip(position) {
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 14, 12),
    new THREE.MeshStandardMaterial({
      color: SHUTTLE_COLOR_HEX,
      emissive: 0xeaf6ff,
      emissiveIntensity: 1.05,
      metalness: 0.25,
      roughness: 0.25,
    }),
  );
  tip.position.copy(position);
  return tip;
}

export function createShuttle() {
  const group = new THREE.Group();

  const armLength = 0.95;
  const armRadius = 0.085;
  group.add(makeArm(armLength, armRadius, 'x'));
  group.add(makeArm(armLength, armRadius, 'y'));
  group.add(makeArm(armLength, armRadius, 'z'));

  group.add(makeTip(new THREE.Vector3(armLength, 0, 0)));
  group.add(makeTip(new THREE.Vector3(0, armLength, 0)));
  group.add(makeTip(new THREE.Vector3(0, 0, armLength)));

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 18, 14),
    new THREE.MeshStandardMaterial({
      color: SHUTTLE_COLOR_HEX,
      emissive: 0xffffff,
      emissiveIntensity: 1.35,
      metalness: 0.2,
      roughness: 0.2,
    }),
  );
  group.add(core);

  return group;
}
