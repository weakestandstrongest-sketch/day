// 本物らしい素材の地 — 木目・フェルト・麻縄・漆のむら。canvas で一度だけ作って使い回す
//
// どれも乱数の種を固定しているので、毎回同じ模様になる。

// ---- 値ノイズ ----

function makeNoise(seed) {
  const P = new Uint8Array(512);
  let r = seed >>> 0 || 1;
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  const V = Float32Array.from({ length: 256 }, () => rand());
  const fade = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = V[P[P[X] + Y]], b = V[P[P[X + 1] + Y]], c = V[P[P[X] + Y + 1]], d = V[P[P[X + 1] + Y + 1]];
    const u = fade(xf), v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, oct = 4) => {
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += amp * noise(x * f, y * f); f *= 2.03; amp *= 0.5; }
    return s / (1 - 0.5 ** oct);
  };
  return { noise, fbm, rand };
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ---- 木目 ----
// figure: 'straight' (柾目 — 平行な細い年輪) / 'flat' (板目 — 山形の模様)
export function wood({ w = 1024, h = 1024, light = '#e4c48c', dark = '#b98a4c', ink = '#7a5228', rings = 38, warp = 0.9, figure = 'straight', pores = 0.18, seed = 3 } = {}) {
  return cached(`wood|${w}|${h}|${light}|${dark}|${ink}|${rings}|${warp}|${figure}|${pores}|${seed}`, () => {
    const { fbm, noise, rand } = makeNoise(seed);
    const c = canvas(w, h);
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const L = hex(light), D = hex(dark), K = hex(ink);
    const cx = w * (0.3 + rand() * 0.4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = x / w, ny = y / h;
        const wob = fbm(nx * 3, ny * 0.7, 4) * warp;
        let t;
        if (figure === 'flat') {
          const dx = (x - cx) / w;
          t = (ny * 0.6 + dx * dx * 2.4 + wob * 0.35) * rings;
        } else {
          t = (nx + wob * 0.08) * rings;
        }
        const f = t - Math.floor(t);
        // 晩材の濃い線と、春材のやわらかい広がり
        const late = Math.pow(Math.max(0, 1 - Math.abs(f - 0.82) / 0.16), 2.2);
        const early = 0.5 - 0.5 * Math.cos(f * Math.PI * 2);
        const streak = noise(nx * 260, ny * 6) * pores + noise(nx * 900, ny * 18) * pores * 0.6;
        const tone = clamp01(early * 0.45 + fbm(nx * 2, ny * 2, 3) * 0.35);
        const i = (y * w + x) * 4;
        for (let k = 0; k < 3; k++) {
          let v = mix(L[k], D[k], tone);
          v = mix(v, K[k], late * 0.55 + streak * 0.45);
          img.data[i + k] = v;
        }
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  });
}

// ---- フェルト (毛足の細かいむら) ----
export function felt({ w = 512, h = 512, color = '#1f3b31', seed = 9 } = {}) {
  return cached(`felt|${w}|${h}|${color}|${seed}`, () => {
    const { fbm, noise } = makeNoise(seed);
    const c = canvas(w, h);
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const C = hex(color);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = fbm(x / 90, y / 90, 3) * 0.5 + noise(x * 0.9, y * 0.9) * 0.35 + noise(x * 2.7, y * 2.7) * 0.15;
        const k = 0.78 + n * 0.38;
        const i = (y * w + x) * 4;
        img.data[i] = C[0] * k; img.data[i + 1] = C[1] * k; img.data[i + 2] = C[2] * k; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  });
}

// ---- 漆のむら (研ぎ出しのような、ごく淡い濃淡) ----
export function lacquer({ w = 512, h = 512, color = '#2a0f10', seed = 4 } = {}) {
  return cached(`lacquer|${w}|${h}|${color}|${seed}`, () => {
    const { fbm } = makeNoise(seed);
    const c = canvas(w, h);
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const C = hex(color);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = fbm(x / 160, y / 160, 5);
        const k = 0.72 + n * 0.55;
        const i = (y * w + x) * 4;
        img.data[i] = C[0] * k; img.data[i + 1] = C[1] * k; img.data[i + 2] = C[2] * k; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  });
}

// ---- 麻縄 (ダーツ盤のシサル) — 白い透過の繊維。上に重ねて使う ----
export function sisal({ w = 512, h = 512, seed = 21 } = {}) {
  return cached(`sisal|${w}|${h}|${seed}`, () => {
    const { rand, noise } = makeNoise(seed);
    const c = canvas(w, h);
    const g = c.getContext('2d');
    for (let i = 0; i < 9000; i++) {
      const x = rand() * w, y = rand() * h;
      const a = rand() * Math.PI;
      const len = 1 + rand() * 4;
      const light = noise(x * 0.05, y * 0.05) > 0.5;
      g.strokeStyle = light ? `rgba(255,248,230,${0.05 + rand() * 0.12})` : `rgba(0,0,0,${0.08 + rand() * 0.16})`;
      g.lineWidth = 0.6 + rand() * 0.8;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    return c;
  });
}

export const url = (c, q = 0.86) => {
  if (!c.__url) c.__url = c.toDataURL('image/jpeg', q);
  return c.__url;
};
