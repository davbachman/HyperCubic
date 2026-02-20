import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export function createSceneSystem(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x111217, 0.085);

  const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 120);
  camera.position.set(0.88, 0.54, -2.72);
  camera.lookAt(0, 0, 0);

  const ambient = new THREE.AmbientLight(0x6f7fa8, 0.4);
  scene.add(ambient);

  const sideLight = new THREE.DirectionalLight(0xb9d8ff, 0.55);
  sideLight.position.set(-3, 4, -2);
  scene.add(sideLight);

  const shuttleLight = new THREE.PointLight(0xe9f5ff, 2.1, 16, 1.6);
  shuttleLight.position.set(0, 0.35, -0.9);
  scene.add(shuttleLight);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.42, 0.06);
  composer.addPass(bloom);

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function render() {
    composer.render();
  }

  return {
    scene,
    camera,
    renderer,
    composer,
    resize,
    render,
  };
}
