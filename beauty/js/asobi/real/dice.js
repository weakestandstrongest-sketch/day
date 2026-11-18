// ヨットのサイコロを 3D で。ゲーム側の .die ボタン (data-value / .rolling / .held) を毎フレーム読み取って、
// 落ちて、弾んで、決まった目を上にして止まる姿を描く。ボタンは透明なまま、上でタップを受ける
import * as THREE from '../../../vendor/three/three.module.min.js';
import { RoundedBoxGeometry } from '../../../vendor/three/addons/RoundedBoxGeometry.js';
import { studio, canvasTexture } from './studio.js';
import { felt } from './textures.js';

// BoxGeometry の面の順 (+x, -x, +y, -y, +z, -z) に割り当てる目。向かい合う目の和は 7
const FACE = [3, 4, 1, 6, 2, 5];
const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((v) => new THREE.Vector3(...v));
const PIPS = { 1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]], 4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], 5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]], 6: [[0.27, 0.24], [0.73, 0.24], [0.27, 0.5], [0.73, 0.5], [0.27, 0.76], [0.73, 0.76]] };

function faceTexture(v, red) {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const base = g.createRadialGradient(N * 0.4, N * 0.35, 10, N / 2, N / 2, N * 0.75);
  base.addColorStop(0, '#fbf7ee');
  base.addColorStop(1, '#ece4d3');
  g.fillStyle = base;
  g.fillRect(0, 0, N, N);
  const r = v === 1 ? N * 0.14 : N * 0.085;
  for (const [x, y] of PIPS[v]) {
    // 彫り込んだ目: 縁のかげりと、底の色
    const px = x * N, py = y * N;
    const hole = g.createRadialGradient(px - r * 0.3, py - r * 0.35, r * 0.1, px, py, r);
    if (v === 1) { hole.addColorStop(0, red); hole.addColorStop(1, '#5a0f0c'); }
    else { hole.addColorStop(0, '#3b342e'); hole.addColorStop(1, '#0d0a08'); }
    g.fillStyle = hole;
    g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(px, py, r + 0.8, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  }
  return canvasTexture(c);
}

const easeOut = (t) => 1 - (1 - t) ** 3;
const backOut = (t) => { const s = 1.6; return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2; };

export function attachDice(tray, diceEls) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return () => {};
  }
  const { env } = studio();
  tray.classList.add('dice-3d');
  const canvas = renderer.domElement;
  canvas.className = 'dice-canvas';
  tray.prepend(canvas);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.environment = env;
  const kc = getComputedStyle(document.documentElement).getPropertyValue('--kc').trim() || '#bb5548';
  const mid = getComputedStyle(document.documentElement).getPropertyValue('--k-mid').trim() || '#5a2a26';

  // 節気の色の毛氈 (もうせん)
  const feltTex = canvasTexture(felt({ color: mid, seed: 31 }), { repeat: [3, 3] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: feltTex, roughness: 1, color: 0x9a928a }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const key = new THREE.DirectionalLight(0xfff2df, 2.6);
  key.position.set(-4, 9, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  key.shadow.blurSamples = 16;
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  scene.add(key, key.target, new THREE.HemisphereLight(0xfff6ea, 0x223028, 0.35));

  const geo = new RoundedBoxGeometry(1, 1, 1, 5, 0.13);
  const mats = FACE.map((v) => new THREE.MeshPhysicalMaterial({ map: faceTexture(v, kc), roughness: 0.26, clearcoat: 0.8, clearcoatRoughness: 0.1, transparent: true }));
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf4f0ea, transparent: true, opacity: 0 });

  const dice = diceEls.map(() => {
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.76, 64), ringMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(mesh, ring);
    return { mesh, ring, x: 0, value: '', rolling: false, held: false, phase: 'hidden', t0: 0, spin: new THREE.Vector3(), from: new THREE.Quaternion(), to: new THREE.Quaternion(), y: 0, lift: 0 };
  });

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const elev = 58 * Math.PI / 180;
  let unit = 1;

  function layout() {
    const w = tray.clientWidth, h = tray.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const b = diceEls[0].getBoundingClientRect();
    unit = Math.max(20, b.width * 0.82); // 1 マスのサイコロが何 px か
    const halfW = w / 2 / unit, halfH = h / 2 / unit;
    Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    camera.updateProjectionMatrix();
    camera.position.set(0, 0.45 + Math.sin(elev) * 20, Math.cos(elev) * 20);
    camera.lookAt(0, 0.45, 0);
    const tr = tray.getBoundingClientRect();
    diceEls.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      dice[i].x = (r.left + r.width / 2 - (tr.left + tr.width / 2)) / unit;
    });
  }
  const ro = new ResizeObserver(layout);
  ro.observe(tray);
  layout();

  const target = (value) => {
    const f = FACE.indexOf(Number(value));
    const q = new THREE.Quaternion().setFromUnitVectors(NORMALS[f], new THREE.Vector3(0, 1, 0));
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.7);
    return yaw.multiply(q);
  };

  let raf = 0, last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    diceEls.forEach((el, i) => {
      const d = dice[i];
      const value = el.dataset.value || '';
      const rolling = el.classList.contains('rolling');
      d.held = el.classList.contains('held');
      if (rolling && !d.rolling) {
        // 振りはじめ: 上から落ちてくる
        d.phase = 'tumble';
        d.t0 = now;
        d.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(14 + Math.random() * 8);
        if (!d.value) d.y = 3 + Math.random() * 1.5;
      }
      if (!rolling && d.rolling && value) {
        d.phase = 'settle';
        d.t0 = now;
        d.from.copy(d.mesh.quaternion);
        d.to.copy(target(value));
        d.y0 = d.y;
      }
      if (!rolling && !d.rolling && value !== d.value) {
        if (!value) d.phase = 'hidden';
        else { d.phase = 'rest'; d.mesh.quaternion.copy(target(value)); d.y = 0; }
      }
      d.rolling = rolling;
      d.value = value;

      const m = d.mesh;
      m.visible = d.phase !== 'hidden';
      if (d.phase === 'tumble') {
        const t = (now - d.t0) / 1000;
        const dq = new THREE.Quaternion().setFromAxisAngle(d.spin.clone().normalize(), d.spin.length() * dt);
        m.quaternion.premultiply(dq);
        const fall = Math.max(0, d.y - dt * 14);
        d.y = fall > 0.01 ? fall : Math.abs(Math.sin(t * 13 + i)) * 0.55;
        m.position.z = Math.sin(t * 7 + i * 2) * 0.12;
      } else if (d.phase === 'settle') {
        const t = Math.min(1, (now - d.t0) / 480);
        m.quaternion.slerpQuaternions(d.from, d.to, backOut(t));
        d.y = d.y0 * (1 - easeOut(t)) + Math.abs(Math.sin(t * Math.PI * 2)) * 0.18 * (1 - t);
        m.position.z *= 0.85;
        if (t >= 1) d.phase = 'rest';
      } else {
        m.position.z *= 0.85;
      }
      d.lift += ((d.held ? 0.42 : 0) - d.lift) * Math.min(1, dt * 12);
      m.position.x = d.x;
      m.position.y = 0.5 + d.y + d.lift;
      d.ring.position.x = d.x;
      d.ring.material.opacity += ((d.held && m.visible ? 0.85 : 0) - d.ring.material.opacity) * Math.min(1, dt * 10);
    });
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    geo.dispose();
    mats.forEach((m) => { m.map.dispose(); m.dispose(); });
    feltTex.dispose();
    renderer.dispose();
    canvas.remove();
    tray.classList.remove('dice-3d');
  };
}
