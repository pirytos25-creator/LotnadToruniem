// Procedurally painted textures (no downloads): facade atlas, roof atlas, water normals, sprites.
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function noise(ctx, x, y, w, h, amt, r, dots = 900, size = 2) {
  for (let i = 0; i < dots; i++) {
    const v = (r() - 0.5) * amt;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(x + r() * w, y + r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
}

// Facade atlas: 4 x 2 tiles, each tile = one window bay x one storey.
// RGB = albedo detail (walls near-white, tinted per building in shader), A = glass mask.
export const FACADE = {
  // style: [bay width m, storey height m]
  unit: [[3.3, 3.7], [3.6, 4.2], [3.0, 2.85], [3.6, 3.0], [6.0, 5.0], [2.2, 3.5], [3.2, 2.7], [4.0, 4.0]],
};

export function makeFacadeAtlas() {
  const T = 256;
  const cv = document.createElement('canvas'); cv.width = T * 4; cv.height = T * 2;
  const ctx = cv.getContext('2d');
  // alpha channel is painted separately then merged
  const am = document.createElement('canvas'); am.width = cv.width; am.height = cv.height;
  const actx = am.getContext('2d');
  actx.fillStyle = '#000'; actx.fillRect(0, 0, am.width, am.height);
  const r = rng(42);

  const glassGrad = (x, y, w, h) => {
    const g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
    g.addColorStop(0, '#5b6f86'); g.addColorStop(0.45, '#2a3748'); g.addColorStop(1, '#1b2431');
    return g;
  };
  const win = (ox, oy, x, y, w, h, frame = 7, frameCol = '#f4f2ec', muntin = true, arch = false) => {
    ctx.save(); ctx.translate(ox, oy);
    // reveal shadow
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    if (arch) { archPath(ctx, x - 3, y - 3, w + 6, h + 6); ctx.fill(); }
    else ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = frameCol;
    if (arch) { archPath(ctx, x, y, w, h); ctx.fill(); }
    else ctx.fillRect(x, y, w, h);
    ctx.fillStyle = glassGrad(x, y, w, h);
    const gx = x + frame, gy = y + frame, gw = w - frame * 2, gh = h - frame * 2;
    if (arch) { archPath(ctx, gx, gy, gw, gh); ctx.fill(); }
    else ctx.fillRect(gx, gy, gw, gh);
    if (muntin) {
      ctx.fillStyle = frameCol;
      ctx.fillRect(gx + gw / 2 - 2, gy, 4, gh);
      ctx.fillRect(gx, gy + gh * 0.33, gw, 4);
    }
    ctx.restore();
    actx.save(); actx.translate(ox, oy); actx.fillStyle = '#fff';
    if (arch) { archPath(actx, gx, gy, gw, gh); actx.fill(); } else actx.fillRect(gx, gy, gw, gh);
    if (muntin) { actx.fillStyle = '#000'; actx.fillRect(gx + gw / 2 - 2, gy, 4, gh); actx.fillRect(gx, gy + gh * 0.33, gw, 4); }
    actx.restore();
  };
  function archPath(c, x, y, w, h) {
    c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w * 0.6);
    c.quadraticCurveTo(x, y, x + w / 2, y); c.quadraticCurveTo(x + w, y, x + w, y + w * 0.6);
    c.lineTo(x + w, y + h); c.closePath();
  }
  const tile = (i, j) => [i * T, j * T];

  // 0 kamienica: plaster, tall window with white frame, cornice band
  { const [ox, oy] = tile(0, 0);
    ctx.fillStyle = '#f2efe8'; ctx.fillRect(ox, oy, T, T); noise(ctx, ox, oy, T, T, 0.08, r, 1400, 2);
    ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fillRect(ox, oy + 6, T, 10);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(ox, oy, T, 6);
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(ox + 22, oy + 34, T - 44, 8);
    win(ox, oy, 76, 48, 104, 170, 8);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(ox + 68, oy + 222, 120, 7); }
  // 1 gothic brick: bricks + pointed-arch window
  { const [ox, oy] = tile(1, 0);
    ctx.fillStyle = '#e9dcd2'; ctx.fillRect(ox, oy, T, T);
    for (let y = 0; y < T; y += 12) for (let x = ((y / 12) % 2) * -14; x < T; x += 28) {
      const v = 0.82 + r() * 0.3; ctx.fillStyle = `rgb(${220 * v | 0},${205 * v | 0},${195 * v | 0})`;
      ctx.fillRect(ox + x + 1, oy + y + 1, 26, 10);
    }
    win(ox, oy, 92, 40, 72, 190, 6, '#d9cbbd', false, true);
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(ox + 86, oy + 232, 84, 6); }
  // 2 blok (prefab): panel joints, wide window, balcony slab hint
  { const [ox, oy] = tile(2, 0);
    ctx.fillStyle = '#efefec'; ctx.fillRect(ox, oy, T, T); noise(ctx, ox, oy, T, T, 0.06, r, 900, 3);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(ox, oy + T - 4, T, 4); ctx.fillRect(ox + T - 3, oy, 3, T);
    win(ox, oy, 38, 70, 180, 118, 7, '#f7f7f5', true);
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(ox + 30, oy + 192, 196, 10); }
  // 3 dom: plaster, window with cross
  { const [ox, oy] = tile(3, 0);
    ctx.fillStyle = '#f4f1ea'; ctx.fillRect(ox, oy, T, T); noise(ctx, ox, oy, T, T, 0.07, r, 1200, 2);
    win(ox, oy, 72, 62, 112, 124, 8, '#ffffff', true);
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(ox + 64, oy + 190, 128, 6); }
  // 4 hala: corrugated panels, high strip window
  { const [ox, oy] = tile(0, 1);
    ctx.fillStyle = '#e6e6e3'; ctx.fillRect(ox, oy, T, T);
    for (let x = 0; x < T; x += 8) { ctx.fillStyle = 'rgba(0,0,0,.07)'; ctx.fillRect(ox + x, oy, 3, T); }
    win(ox, oy, 10, 26, T - 20, 40, 5, '#d8d8d8', false);
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(ox, oy + T - 30, T, 30); }
  // 5 nowy: curtain wall
  { const [ox, oy] = tile(1, 1);
    ctx.fillStyle = '#c9ced4'; ctx.fillRect(ox, oy, T, T);
    const g = ctx.createLinearGradient(ox, oy, ox + T, oy + T); g.addColorStop(0, '#8fa6bd'); g.addColorStop(.5, '#4a5f75'); g.addColorStop(1, '#2d3b4b');
    ctx.fillStyle = g; ctx.fillRect(ox + 10, oy + 10, T - 20, T - 44);
    actx.fillStyle = '#fff'; actx.fillRect(ox + 10, oy + 10, T - 20, T - 44);
    ctx.fillStyle = '#d7dbe0'; ctx.fillRect(ox + T / 2 - 3, oy + 10, 6, T - 44); actx.fillStyle = '#000'; actx.fillRect(ox + T / 2 - 3, oy + 10, 6, T - 44); }
  // 6 garaz / plain utility: door
  { const [ox, oy] = tile(2, 1);
    ctx.fillStyle = '#ecebe6'; ctx.fillRect(ox, oy, T, T); noise(ctx, ox, oy, T, T, 0.1, r, 900, 3);
    ctx.fillStyle = '#b9bcbf'; ctx.fillRect(ox + 26, oy + 70, T - 52, T - 70);
    for (let y = 80; y < T; y += 18) { ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(ox + 26, oy + y, T - 52, 3); } }
  // 7 plain brick (walls, gables)
  { const [ox, oy] = tile(3, 1);
    ctx.fillStyle = '#e4d6cb'; ctx.fillRect(ox, oy, T, T);
    for (let y = 0; y < T; y += 12) for (let x = ((y / 12) % 2) * -14; x < T; x += 28) {
      const v = 0.8 + r() * 0.32; ctx.fillStyle = `rgb(${222 * v | 0},${206 * v | 0},${196 * v | 0})`;
      ctx.fillRect(ox + x + 1, oy + y + 1, 26, 10);
    } }

  // merge alpha without canvas premultiplication (keeps wall colour under alpha 0)
  const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const a = actx.getImageData(0, 0, cv.width, cv.height).data;
  const data = new Uint8Array(img.length);
  for (let i = 0; i < img.length; i += 4) { data[i] = img[i]; data[i + 1] = img[i + 1]; data[i + 2] = img[i + 2]; data[i + 3] = a[i]; }
  const tex = new THREE.DataTexture(data, cv.width, cv.height, THREE.RGBAFormat);
  tex.flipY = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// Roof atlas 2x2: 0 ceramic tile, 1 flat membrane/gravel, 2 metal standing seam, 3 slate/dark tile
export function makeRoofAtlas() {
  const T = 256;
  const cv = document.createElement('canvas'); cv.width = T * 2; cv.height = T * 2;
  const ctx = cv.getContext('2d');
  const r = rng(7);
  // ceramic "karpiówka" rows
  ctx.fillStyle = '#e8e2dc'; ctx.fillRect(0, 0, T, T);
  for (let y = 0; y < T; y += 16) {
    const off = (y / 16) % 2 ? 0 : 10;
    for (let x = -off; x < T; x += 20) {
      const v = 0.78 + r() * 0.34;
      ctx.fillStyle = `rgb(${250 * v | 0},${240 * v | 0},${232 * v | 0})`;
      ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + 19, y); ctx.lineTo(x + 19, y + 11); ctx.quadraticCurveTo(x + 10, y + 17, x + 1, y + 11); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(0, y + 14, T, 2);
  }
  // flat roof: membrane + gravel speckle + seams
  ctx.fillStyle = '#e6e6e4'; ctx.fillRect(T, 0, T, T);
  noise(ctx, T, 0, T, T, 0.16, r, 5000, 2);
  ctx.fillStyle = 'rgba(0,0,0,.08)'; for (let y = 0; y < T; y += 64) ctx.fillRect(T, y, T, 2);
  // metal standing seam
  ctx.fillStyle = '#eaeaea'; ctx.fillRect(0, T, T, T);
  for (let x = 0; x < T; x += 21) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x, T, 2, T); ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x + 2, T, 2, T); }
  noise(ctx, 0, T, T, T, 0.05, r, 600, 3);
  // slate
  ctx.fillStyle = '#e0e0e0'; ctx.fillRect(T, T, T, T);
  for (let y = 0; y < T; y += 14) {
    const off = (y / 14) % 2 ? 0 : 12;
    for (let x = -off; x < T; x += 24) { const v = 0.75 + r() * 0.3; ctx.fillStyle = `rgb(${235 * v | 0},${235 * v | 0},${238 * v | 0})`; ctx.fillRect(T + x + 1, T + y + 1, 22, 12); }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// tiling normal map for water from summed waves
export function makeWaterNormals(size = 256) {
  const h = new Float32Array(size * size);
  const r = rng(99);
  const waves = [];
  for (let k = 0; k < 28; k++) {
    const a = r() * Math.PI * 2, f = 1 + Math.floor(r() * 12);
    waves.push([Math.round(Math.cos(a) * f), Math.round(Math.sin(a) * f), r() * 6.28, 1 / (f * 0.9 + 1)]);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    for (const [kx, ky, ph, amp] of waves) v += Math.sin((kx * x + ky * y) / size * Math.PI * 2 + ph) * amp;
    h[y * size + x] = v;
  }
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
    const hy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
    let nx = -hx * 0.35, ny = -hy * 0.35, nz = 1; const l = Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(d, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function makeGlowSprite() {
  const s = 64, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,240,210,1)'); g.addColorStop(0.18, 'rgba(255,200,120,.85)'); g.addColorStop(0.5, 'rgba(255,160,70,.18)'); g.addColorStop(1, 'rgba(255,140,60,0)');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function makeCloudSprite() {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const c = cv.getContext('2d');
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const x = s / 2 + (r() - 0.5) * s * 0.5, y = s / 2 + (r() - 0.5) * s * 0.35, rad = s * (0.12 + r() * 0.16);
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function makeStarTexture() {
  const s = 32, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(220,230,255,.5)'); g.addColorStop(1, 'rgba(200,210,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(cv);
}
