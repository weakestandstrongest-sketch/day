// 駒・石・矢の 3D モデルと、それを撮った画像 (スプライト)
import { THREE, studio, stage, castAll, shoot, topCamera, canvasTexture } from './studio.js';
import { wood } from './textures.js';

const V = (r, y) => new THREE.Vector2(r, y);
const lathe = (pts, seg = 72) => new THREE.LatheGeometry(pts.map(([r, y]) => V(r, y)), seg);
const arc = (cx, cy, r, a0, a1, n = 14) =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const deg = Math.PI / 180;

// ---- 材質 ----

function grainTex(light, dark, ink, seed) {
  return canvasTexture(wood({ w: 256, h: 256, light, dark, ink, rings: 22, warp: 0.6, pores: 0.08, seed }), { repeat: [2, 1] });
}

const MATS = {
  boxwood: () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: grainTex('#f1e3c4', '#e2cb9c', '#c3a26c', 5), roughness: 0.34, clearcoat: 0.75, clearcoatRoughness: 0.14 }),
  ebony: () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: grainTex('#2b211b', '#1d1612', '#0d0907', 6), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),
  felt: () => new THREE.MeshStandardMaterial({ color: 0x1d3a2f, roughness: 1 }),
};

// ---- チェス (スタントン型) ----

const BASE = [[0, 0], [0.4, 0], [0.425, 0.015], [0.43, 0.055], [0.41, 0.08], [0.365, 0.09], [0.36, 0.115], [0.385, 0.13], [0.375, 0.16], [0.32, 0.19], [0.275, 0.21]];
const PROFILES = {
  p: [...BASE, [0.21, 0.26], [0.155, 0.36], [0.13, 0.46], [0.122, 0.52], [0.19, 0.548], [0.2, 0.572], [0.18, 0.596], [0.115, 0.61], ...arc(0, 0.75, 0.155, -64 * deg, 90 * deg)],
  r: [...BASE, [0.265, 0.25], [0.245, 0.32], [0.215, 0.74], [0.235, 0.79], [0.285, 0.83], [0.295, 0.875], [0.278, 0.9], [0.278, 0.99], [0.215, 0.99], [0.215, 0.955], [0, 0.955]],
  b: [...BASE, [0.245, 0.25], [0.17, 0.34], [0.13, 0.6], [0.12, 0.7], [0.205, 0.73], [0.215, 0.762], [0.17, 0.79], [0.12, 0.8], [0.16, 0.86], [0.205, 0.96], [0.215, 1.06], [0.185, 1.18], [0.125, 1.27], [0.05, 1.315], [0.038, 1.33], ...arc(0, 1.375, 0.052, -45 * deg, 90 * deg, 8)],
  q: [...BASE, [0.265, 0.25], [0.19, 0.34], [0.145, 0.6], [0.125, 0.86], [0.215, 0.89], [0.225, 0.925], [0.175, 0.955], [0.13, 0.97], [0.15, 1.05], [0.22, 1.3], [0.275, 1.45], [0.255, 1.475], [0.2, 1.475], [0.17, 1.5], [0.1, 1.555], [0.04, 1.585], ...arc(0, 1.64, 0.062, -50 * deg, 90 * deg, 8)],
  k: [...BASE, [0.275, 0.25], [0.2, 0.34], [0.152, 0.62], [0.132, 0.92], [0.225, 0.955], [0.235, 0.99], [0.18, 1.02], [0.14, 1.04], [0.16, 1.12], [0.23, 1.4], [0.255, 1.5], [0.225, 1.52], [0.13, 1.56], [0.105, 1.62], [0, 1.625]],
  n: [...BASE, [0.27, 0.215], [0.285, 0.25], [0.29, 0.272], [0, 0.272]],
};

function knightHead(mat) {
  // 横顔 (オリジナルの駒の輪郭) を押し出して、面取りする
  const T = (x, y) => [(x - 50) / 62, (80 - y) / 62 + 0.27];
  const sh = new THREE.Shape();
  sh.moveTo(...T(68, 80));
  sh.lineTo(...T(32, 80));
  const C = (a, b, c, d, e, f) => sh.bezierCurveTo(...T(a, b), ...T(c, d), ...T(e, f));
  C(32, 66, 38, 58, 49, 51);
  C(42, 52, 36, 55, 30, 58);
  C(24, 61, 17, 57, 18, 50);
  C(19, 44, 27, 36, 33, 30);
  C(36, 24, 38, 17, 42, 11);
  sh.lineTo(...T(47, 19));
  C(51, 16, 55, 15, 58, 16);
  C(72, 22, 80, 38, 78, 56);
  C(77, 66, 72, 73, 68, 80);
  const depth = 0.2;
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 5, curveSegments: 24 });
  g.translate(0, 0, -depth / 2);
  const head = new THREE.Group();
  head.add(new THREE.Mesh(g, mat));
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0806, roughness: 0.2, clearcoat: 1 });
  for (const z of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), eyeMat);
    eye.position.set(...T(38, 33), z * (depth / 2 + 0.048));
    head.add(eye);
  }
  return head;
}

function chessPiece(t, color) {
  const mat = color === 'w' ? MATS.boxwood() : MATS.ebony();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(lathe(PROFILES[t]), mat));
  if (t === 'r') {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.07), mat);
      const a = (i / 6) * Math.PI * 2 + 0.3;
      m.position.set(Math.cos(a) * 0.245, 1.03, Math.sin(a) * 0.245);
      m.rotation.y = -a;
      g.add(m);
    }
  }
  if (t === 'q') {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 10), mat);
      m.position.set(Math.cos(a) * 0.255, 1.495, Math.sin(a) * 0.255);
      g.add(m);
    }
  }
  if (t === 'k') {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.27, 0.065), mat);
    v.position.y = 1.75;
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.06, 0.065), mat);
    h.position.y = 1.78;
    g.add(v, h);
  }
  if (t === 'b') {
    // ミトラの切れ込み
    const cut = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.3), new THREE.MeshPhysicalMaterial({ color: color === 'w' ? 0x8a6f4d : 0x050403, roughness: 0.6 }));
    cut.position.set(0.04, 1.13, 0.06);
    cut.rotation.set(0, 0.5, 0.75);
    cut.scale.set(1, 1, 0.8);
    g.add(cut);
  }
  if (t === 'n') {
    const head = knightHead(mat);
    head.rotation.y = color === 'w' ? -0.35 : Math.PI + 0.35; // 白は左、黒は右を向いて斜めに
    g.add(head);
  }
  g.rotation.y = color === 'w' ? 0.25 : -0.25;
  return castAll(g);
}

// 駒は少し上から見た姿。全部同じ画角で撮るので背の高さがそろう
const CHESS_W = 220, CHESS_H = 396;
function chessCamera() {
  const c = new THREE.PerspectiveCamera(17, CHESS_W / CHESS_H, 0.1, 50);
  const e = 27 * deg, D = 7.6, ty = 0.86;
  c.position.set(0, ty + D * Math.sin(e), D * Math.cos(e));
  c.lookAt(0, ty, 0);
  return c;
}

export function chessSprites() {
  const out = {};
  for (const color of ['w', 'b']) {
    for (const t of ['p', 'r', 'n', 'b', 'q', 'k']) {
      const scene = stage({ key: [-1.6, 8, 3.2], shadowOpacity: 0.36, shadowRadius: 9 });
      scene.add(chessPiece(t, color));
      const shot = shoot(scene, chessCamera(), CHESS_W, CHESS_H, [0, 0, 0]);
      out[`${color}${t}`] = shot;
    }
  }
  return out;
}

// ---- 碁石 (蛤と那智黒) ----

function shellTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f0e6';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = `rgba(170,158,135,${0.05 + Math.random() * 0.1})`;
    g.lineWidth = 1 + Math.random() * 2.5;
    g.beginPath();
    g.ellipse(128, -380, 420 + i * 8.5, 420 + i * 8.5, 0, 0, Math.PI);
    g.stroke();
  }
  return canvasTexture(c);
}

function goStone(color) {
  const geo = new THREE.SphereGeometry(0.5, 64, 32);
  geo.scale(1, 0.34, 1);
  const mat = color === 'w'
    ? new THREE.MeshPhysicalMaterial({ map: shellTex(), roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.3 })
    : new THREE.MeshPhysicalMaterial({ color: 0x141414, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.17;
  m.rotation.y = Math.random() * 6;
  return castAll(m);
}

function reversiDisc(color) {
  const geo = lathe([[0, 0], [0.45, 0], [0.485, 0.012], [0.5, 0.04], [0.5, 0.075], [0.488, 0.1], [0.46, 0.112], [0.3, 0.115], [0, 0.112]], 72);
  const mat = color === 'w'
    ? new THREE.MeshPhysicalMaterial({ color: 0xf1ede4, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.12 })
    : new THREE.MeshPhysicalMaterial({ color: 0x030303, roughness: 0.3, clearcoat: 0.55, clearcoatRoughness: 0.2, envMapIntensity: 0.18 });
  return castAll(new THREE.Mesh(geo, mat));
}

export function topSprites() {
  const out = {};
  const shot = (key, obj, half = 0.72, size = 192) => {
    const scene = stage({ key: [-2.2, 6, -1.8], shadowOpacity: 0.5, shadowRadius: 9 });
    scene.add(obj);
    out[key] = shoot(scene, topCamera(half), size, size).url;
  };
  shot('go-b', goStone('b'));
  shot('go-w', goStone('w'));
  shot('rv-b', reversiDisc('b'), 0.68);
  shot('rv-w', reversiDisc('w'), 0.68);
  return out;
}

// ---- ガラス玉 (ヒット&ブロー) ----

export function pegSprites(colors) {
  const out = {};
  for (const hex of colors) {
    const scene = stage({ key: [-2.2, 6, -1.8], shadowOpacity: 0.55, shadowRadius: 8 });
    const geo = new THREE.SphereGeometry(0.5, 48, 32);
    geo.scale(1, 0.8, 1);
    const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.4, sheenColor: new THREE.Color(0xffffff) }));
    m.position.y = 0.4;
    scene.add(castAll(m));
    out[hex] = shoot(scene, topCamera(0.72), 160, 160).url;
  }
  return out;
}

// ---- 将棋の駒 (柘植に漆書き) ----

function komaFace(label, red) {
  const W = 430, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.drawImage(wood({ w: 512, h: 512, light: '#efd49a', dark: '#e0bb74', ink: '#b88a45', rings: 30, warp: 0.5, pores: 0.12, seed: 13 }), 0, 0, W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${label.length > 1 ? 150 : 236}px "Zen Old Mincho", "Hiragino Mincho ProN", serif`;
  const y = H * 0.57;
  // 盛り上げた漆の、わずかな厚み
  g.fillStyle = 'rgba(255,240,210,.55)';
  g.fillText(label, W / 2 - 2, y - 2);
  g.fillStyle = red ? '#9e1f18' : '#160e07';
  g.fillText(label, W / 2, y);
  return canvasTexture(c);
}

function koma(label, red) {
  const sh = new THREE.Shape();
  sh.moveTo(-0.42, -0.5);
  sh.lineTo(0.42, -0.5);
  sh.lineTo(0.345, 0.3);
  sh.lineTo(0, 0.5);
  sh.lineTo(-0.345, 0.3);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.13, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 4 });
  // 尻が厚く、頭が薄い
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * (0.72 + 0.28 * (0.5 - p.getY(i))));
  geo.computeVertexNormals();
  const face = komaFace(label, red);
  face.repeat.set(1 / 0.84, 1);
  face.offset.set(0.5, 0.5);
  const side = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: canvasTexture(wood({ w: 256, h: 256, light: '#e8c585', dark: '#cfa25c', ink: '#a8783a', rings: 18, seed: 14 })), roughness: 0.42, clearcoat: 0.4 });
  const top = new THREE.MeshPhysicalMaterial({ map: face, roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.25 });
  const m = new THREE.Mesh(geo, [top, side]);
  m.rotation.x = -Math.PI / 2;
  return castAll(m);
}

export async function komaSprites(labels) {
  await document.fonts.load('700 100px "Zen Old Mincho"', labels.map((l) => l.text).join('')).catch(() => {});
  const out = {};
  for (const { key, text, red } of labels) {
    const scene = stage({ key: [-2.4, 6, 1.2], shadowOpacity: 0.5, shadowRadius: 8 });
    scene.add(koma(text, red));
    out[key] = shoot(scene, topCamera(0.62, 14), 200, 200).url;
  }
  return out;
}

// ---- ダーツの矢 — 盤に刺さった姿を、盤の正面から ----

function dart(color) {
  const g = new THREE.Group();
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd0, metalness: 1, roughness: 0.25 });
  const tungsten = new THREE.MeshPhysicalMaterial({ color: 0x8d9096, metalness: 1, roughness: 0.32 });
  const anod = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), metalness: 0.7, roughness: 0.3, clearcoat: 0.6 });
  const flightMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.35, clearcoat: 0.5, side: THREE.DoubleSide });
  const along = (geo) => { geo.rotateX(Math.PI / 2); return geo; }; // y 方向の回転体を z 方向へ
  g.add(new THREE.Mesh(along(lathe([[0, 0], [0.006, 0.02], [0.011, 0.13], [0.016, 0.15], [0, 0.15]], 24)), steel));
  const barrel = [[0, 0.15]];
  for (let i = 0; i <= 14; i++) barrel.push([0.026 + (i % 2 ? 0.004 : 0) + Math.sin((i / 14) * Math.PI) * 0.004, 0.15 + i * 0.02]);
  barrel.push([0.014, 0.44], [0, 0.44]);
  g.add(new THREE.Mesh(along(lathe(barrel, 36)), tungsten));
  g.add(new THREE.Mesh(along(lathe([[0, 0.44], [0.011, 0.44], [0.011, 0.62], [0.014, 0.64], [0, 0.65]], 24)), anod));
  const fs = new THREE.Shape();
  fs.moveTo(0, 0.56);
  fs.lineTo(0.115, 0.7);
  fs.lineTo(0.108, 0.87);
  fs.lineTo(0, 0.84);
  fs.closePath();
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.ShapeGeometry(fs);
    geo.rotateX(Math.PI / 2);
    geo.rotateZ((i * Math.PI) / 2 + Math.PI / 4);
    g.add(new THREE.Mesh(geo, flightMat));
  }
  return castAll(g);
}

export function dartSprites(colors) {
  const out = {};
  // 盤に落ちる影は、ぼかし方式 (VSM) だと四角くにじむので、この撮影だけ PCF に切り替える
  const { renderer } = studio();
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  for (const color of colors) {
    const scene = stage({ key: [-2.5, 3.2, 6], keyIntensity: 2.6, floor: 'z', shadowOpacity: 0.5, shadowRadius: 5 });
    const d = dart(color);
    d.rotation.x = 27 * deg; // 尾が少し下がって、手前へ
    d.rotation.y = 16 * deg;
    scene.add(d);
    const cam = new THREE.PerspectiveCamera(9.5, 1, 0.1, 50);
    cam.position.set(0.2, -0.3, 6);
    cam.lookAt(0.2, -0.3, 0);
    out[color] = shoot(scene, cam, 220, 220, [0, 0, 0]);
  }
  renderer.shadowMap.type = THREE.VSMShadowMap;
  return out;
}

// ---- エアホッケーのマレットとパック ----

export function hockeySprites(colors) {
  const out = {};
  const shot = (key, obj) => {
    const scene = stage({ key: [-2.2, 6, -1.8], shadowOpacity: 0.5, shadowRadius: 8 });
    scene.add(obj);
    out[key] = shoot(scene, topCamera(0.7), 176, 176).url;
  };
  colors.forEach((color, i) => {
    const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1 });
    shot(`mallet${i}`, castAll(new THREE.Mesh(lathe([[0, 0], [0.5, 0], [0.5, 0.075], [0.47, 0.115], [0.32, 0.135], [0.24, 0.19], [0.19, 0.3], [0.21, 0.4], [0.19, 0.47], [0.1, 0.5], [0, 0.505]]), mat)));
  });
  const puck = new THREE.MeshPhysicalMaterial({ color: 0xefeae0, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.1 });
  shot('puck', castAll(new THREE.Mesh(lathe([[0, 0], [0.5, 0], [0.5, 0.06], [0.475, 0.085], [0.39, 0.085], [0.36, 0.072], [0.33, 0.085], [0, 0.085]]), puck)));
  return out;
}
