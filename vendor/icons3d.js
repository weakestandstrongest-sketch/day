// 「コード」の立体アイコン：three.js で本物の3Dとして描き、画像（PNG）にして返す。
// 銀色の金属（少しつやのある）に、虹色の薄い膜（iridescence）がのって、ふちに虹色が出る。少し斜めに傾けて置く。
//   const urls = await render3DIcons(['text', 'url', 'tel', 'mail', 'wifi', 'bar', 'qr'], 192)
import * as THREE from './three/three.module.min.js';
import { RoomEnvironment } from './three/RoomEnvironment.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

// 角の丸い長方形の輪郭
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const extrude = (shape, depth, bevel = 1.6) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 6, curveSegments: 24 });
const tube = (curve, r, seg = 80, closed = false) => new THREE.TubeGeometry(curve, seg, r, 20, closed);
// 線と円弧でできた、閉じた輪（くさりの輪）
function stadium(len, rad) {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + (i / 24) * Math.PI; pts.push(V(len / 2 + Math.cos(a) * rad, Math.sin(a) * rad)); }
  for (let i = 0; i <= 24; i++) { const a = Math.PI / 2 + (i / 24) * Math.PI; pts.push(V(-len / 2 + Math.cos(a) * rad, Math.sin(a) * rad)); }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}

// それぞれの形（大きさはだいたい 40 前後の箱に入るように）
const BUILD = {
  // セリフつきの T
  text() {
    const s = new THREE.Shape();
    s.moveTo(-17, 18); s.lineTo(17, 18); s.lineTo(17, 8); s.lineTo(13.5, 8); s.quadraticCurveTo(12.5, 12.5, 8, 12.5);
    s.lineTo(4, 12.5); s.lineTo(4, -13); s.quadraticCurveTo(4, -15, 7.5, -16); s.lineTo(7.5, -19); s.lineTo(-7.5, -19); s.lineTo(-7.5, -16);
    s.quadraticCurveTo(-4, -15, -4, -13); s.lineTo(-4, 12.5); s.lineTo(-8, 12.5); s.quadraticCurveTo(-12.5, 12.5, -13.5, 8); s.lineTo(-17, 8); s.lineTo(-17, 18);
    return [extrude(s, 6, 1.8)];
  },
  // くさり：2つの輪が、ななめに組み合わさる
  url() {
    // 2つの輪を同じ向きで、ななめにずらして重ねる（前後に少しずらして、組み合わさって見えるように少しひねる）
    const g1 = tube(stadium(14, 7), 3.3, 140, true), g2 = tube(stadium(14, 7), 3.3, 140, true);
    g1.rotateX(0.35); g1.rotateZ(Math.PI / 4); g1.translate(-7, 7, 2);
    g2.rotateX(-0.35); g2.rotateZ(Math.PI / 4); g2.translate(7, -7, -2);
    return [g1, g2];
  },
  // 受話器：ゆるく曲がった持ち手と、両はしの丸い耳あて・口あて
  tel() {
    // 受話器のかたち（上の耳あて・下の口あてがふくらんだ、ゆるいカーブ）を、厚みのある形として押し出す
    const s = new THREE.Shape(), P = (x, y) => [x - 32, 32 - y];
    s.moveTo(...P(20, 9));
    s.bezierCurveTo(...P(13, 10), ...P(9, 15), ...P(10, 22));
    s.bezierCurveTo(...P(12, 37), ...P(27, 52), ...P(42, 54));
    s.bezierCurveTo(...P(49, 55), ...P(54, 51), ...P(54, 45));
    s.lineTo(...P(45, 37));
    s.lineTo(...P(38, 41));
    s.bezierCurveTo(...P(31, 38), ...P(26, 33), ...P(23, 26));
    s.lineTo(...P(27, 19));
    s.lineTo(...P(20, 9));
    return [extrude(s, 6, 2.6)];
  },
  // 封筒：角の丸い箱と、ふたの V の線
  mail() {
    const body = extrude(roundRect(38, 27, 4.5), 5, 1.6); body.translate(0, 0, -2.5);
    const flap = tube(new THREE.CatmullRomCurve3([V(-16, 10.5, 4.4), V(0, -2.5, 4.4), V(16, 10.5, 4.4)], false, 'catmullrom', 0.05), 1.15, 60);
    return [body, flap];
  },
  // Wi-Fi：3本の円弧と、下の丸い点
  wifi() {
    const out = [], cy = -12;
    for (const [r, t] of [[26, 3.0], [17.5, 3.0], [9, 3.0]]) {
      const a0 = Math.PI / 2 - 0.78, a1 = Math.PI / 2 + 0.78, pts = [];
      for (let i = 0; i <= 30; i++) { const a = a0 + (a1 - a0) * (i / 30); pts.push(V(Math.cos(a) * r, cy + Math.sin(a) * r)); }
      const g = tube(new THREE.CatmullRomCurve3(pts), t, 60);
      out.push(g);
      // はしを丸く
      for (const a of [a0, a1]) { const sg = new THREE.SphereGeometry(t, 20, 14); sg.translate(Math.cos(a) * r, cy + Math.sin(a) * r, 0); out.push(sg); }
    }
    const dot = new THREE.SphereGeometry(3.8, 28, 20); dot.translate(0, cy, 0); out.push(dot);
    return out;
  },
  // バーコード：太さのちがう棒
  bar() {
    const out = []; let x = -18;
    for (const w of [4.6, 2.2, 5.6, 2.2, 3.6, 2.2, 5.6]) { const g = extrude(roundRect(w, 34, Math.min(1, w / 3)), 4, 0.9); g.translate(x + w / 2, 0, -2); out.push(g); x += w + 1.8; }
    out.forEach((g) => g.translate(-(x - 1.25 + 18) / 2 + 0, 0, 0));
    return out;
  },
  // QR：四すみのかぎと、中の四角
  qr() {
    const out = [], k = 19, l = 9;
    for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      const c = new THREE.CurvePath();
      c.add(new THREE.LineCurve3(V(sx * k, sy * (k - l)), V(sx * k, sy * (k - 2.5))));
      c.add(new THREE.QuadraticBezierCurve3(V(sx * k, sy * (k - 2.5)), V(sx * k, sy * k), V(sx * (k - 2.5), sy * k)));
      c.add(new THREE.LineCurve3(V(sx * (k - 2.5), sy * k), V(sx * (k - l), sy * k)));
      out.push(tube(c, 2.8, 40));
      for (const p of [V(sx * k, sy * (k - l)), V(sx * (k - l), sy * k)]) { const e = new THREE.SphereGeometry(2.8, 18, 12); e.translate(p.x, p.y, 0); out.push(e); }
    }
    for (const [x, y, s] of [[-6, 6, 8], [6, 6, 8], [-6, -6, 8], [4.5, -4.5, 3.6], [8.2, -8.2, 3.6]]) { const g = extrude(roundRect(s, s, 1.4), 3, 0.9); g.translate(x, y, -1.5); out.push(g); }
    return out;
  },
};

let R = null;
function setup(size) {
  if (R && R.size === size) return R;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
  // ふちに色を足す光（ピンクと水色）
  const l1 = new THREE.DirectionalLight(0xff6fb8, 3.2); l1.position.set(-30, -20, 30); scene.add(l1);
  const l2 = new THREE.DirectionalLight(0x5fdcff, 3.0); l2.position.set(30, 25, 20); scene.add(l2);
  const l3 = new THREE.DirectionalLight(0xffffff, 1.6); l3.position.set(-10, 40, 50); scene.add(l3);
  const l4 = new THREE.DirectionalLight(0x8fffa8, 2.4); l4.position.set(35, -30, 10); scene.add(l4);
  const camera = new THREE.PerspectiveCamera(26, 1, 1, 1000);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xf4f5fa, metalness: 0.45, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06,
    iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 700], envMapIntensity: 1.25,
  });
  // 押し出した形の側面（厚みのところ）：少し色をつけて、虹色が強く出るように
  const side = new THREE.MeshPhysicalMaterial({
    color: 0xd9d2ff, metalness: 0.35, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08,
    iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [300, 900], envMapIntensity: 1.2,
  });
  R = { size, canvas, renderer, scene, camera, mat, side };
  return R;
}

/** keys の立体アイコンを、PNG の data URL にして返す（WebGL が使えなければ {}） */
export async function render3DIcons(keys, size = 192) {
  let r;
  try { r = setup(size); } catch (e) { return {}; }
  const out = {};
  for (const k of keys) {
    const parts = BUILD[k] && BUILD[k](); if (!parts) continue;
    const group = new THREE.Group();
    // 押し出した形は [面, 側面] の2つの材質、管や球は1つ
    for (const g of parts) { const ext = g.type === 'ExtrudeGeometry'; if (!ext) g.computeVertexNormals(); group.add(new THREE.Mesh(g, ext ? [r.mat, r.side] : r.mat)); }
    // 真ん中に寄せて、少し斜めに（右奥へ回し、上から少し見下ろす）
    const box = new THREE.Box3().setFromObject(group), c = box.getCenter(new THREE.Vector3());
    group.children.forEach((m) => m.position.sub(c));
    const holder = new THREE.Group(); holder.add(group);
    holder.rotation.set(-0.42, 0.55, 0.06, 'YXZ');
    r.scene.add(holder);
    holder.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(holder), half = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y) / 2;
    const dist = (half * 1.12) / Math.tan(THREE.MathUtils.degToRad(r.camera.fov / 2)) + (bb.max.z - bb.min.z) / 2;
    r.camera.position.set(0, 0, dist); r.camera.lookAt(0, 0, 0);
    r.renderer.render(r.scene, r.camera);
    out[k] = r.canvas.toDataURL('image/png');
    r.scene.remove(holder);
    parts.forEach((g) => g.dispose());
  }
  return out;
}
