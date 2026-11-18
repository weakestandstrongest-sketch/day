// 撮影スタジオ — 一台の WebGL レンダラで、駒や石を照明つきで撮って画像にする
import * as THREE from '../../../vendor/three/three.module.min.js';
import { RoomEnvironment } from '../../../vendor/three/addons/RoomEnvironment.js';

let S = null;

export function studio() {
  if (S) return S;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  S = { THREE, renderer, env };
  return S;
}

// 照明つきの空の舞台。key は主光源の位置
export function stage({ key = [-3, 6, 4], keyIntensity = 2.4, rim = true, floor = 'y', shadowOpacity = 0.42, shadowRadius = 7 } = {}) {
  const { env } = studio();
  const scene = new THREE.Scene();
  scene.environment = env;
  const light = new THREE.DirectionalLight(0xfff1de, keyIntensity);
  light.position.set(...key);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.radius = shadowRadius;
  light.shadow.blurSamples = 20;
  light.shadow.bias = -0.0004;
  const cam = light.shadow.camera;
  cam.left = cam.bottom = -2.5;
  cam.right = cam.top = 2.5;
  cam.near = 0.5;
  cam.far = 30;
  scene.add(light, light.target);
  if (rim) {
    const back = new THREE.DirectionalLight(0xdfe8ff, 0.9);
    back.position.set(3, 3, -4);
    scene.add(back);
  }
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: shadowOpacity }));
  if (floor === 'y') plane.rotation.x = -Math.PI / 2; // 床 (xz 平面)
  plane.receiveShadow = true;
  scene.add(plane);
  return scene;
}

export function castAll(obj) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

// 撮って PNG にする。anchor を渡すと、その点が画像のどこに写るか (0〜1) も返す
export function shoot(scene, camera, w, h, anchor = null) {
  const { renderer } = studio();
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  let at = null;
  if (anchor) {
    const v = new THREE.Vector3(...anchor).project(camera);
    at = [(v.x + 1) / 2, (1 - v.y) / 2];
  }
  scene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
    }
  });
  return { url, at };
}

// 真上から見下ろすカメラ (画面の上 = 奥)。tilt で手前に少し傾ける
export function topCamera(half, tilt = 0) {
  const c = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 50);
  const t = (tilt * Math.PI) / 180;
  c.position.set(0, 10 * Math.cos(t), 10 * Math.sin(t));
  c.up.set(0, 0, -1);
  c.lookAt(0, 0, 0);
  return c;
}

export function canvasTexture(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}

export { THREE };
