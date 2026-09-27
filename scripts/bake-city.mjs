import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import earcut from "earcut";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const W = 5887.92;
const EXAG = 1.35;
const ground = readFileSync(join(root, "data/ground.rgb"));
const GW = ground.readUInt32LE(0);
const GH = ground.readUInt32LE(4);
const pixels = ground.subarray(8);

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function samplePhoto(u, v) {
  const x = Math.min(GW - 1, Math.max(0, Math.round(u * (GW - 1))));
  const y = Math.min(GH - 1, Math.max(0, Math.round((1 - v) * (GH - 1))));
  const i = (y * GW + x) * 3;
  return [pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255];
}
function roofColor(x, z) {
  return samplePhoto(x / W + 0.5, 0.5 - z / W);
}
function wallColor(x, z, k) {
  let [r, g, b] = roofColor(x, z);
  if (k === "c") {
    r = r * 0.42 + 0.34;
    g = g * 0.32 + 0.12;
    b = b * 0.28 + 0.1;
  } else if (k === "b") {
    r = r * 0.38 + 0.4;
    g = g * 0.28 + 0.14;
    b = b * 0.24 + 0.1;
  } else if (k === "i") {
    const y = r * 0.3 + g * 0.34 + b * 0.2;
    r = y * 0.55 + 0.22;
    g = y * 0.52 + 0.22;
    b = y * 0.5 + 0.22;
  } else {
    r = r * 0.62 + 0.2;
    g = g * 0.55 + 0.17;
    b = b * 0.45 + 0.13;
  }
  return [clamp01(r), clamp01(g), clamp01(b)];
}
function tune(b) {
  const n = (b.n || "").toLowerCase();
  if (!n) return;
  if (n.includes("planetarium")) b.h = 15;
  else if (n.includes("jordanki")) b.h = 18;
  else if (n.includes("arena toruń") || n.includes("arena torun")) b.h = 24;
  else if (n.includes("brama mostowa")) b.h = 22;
  else if (n.includes("brama klasztorna")) b.h = 18;
  else if (n.includes("brama żeglarska") || n.includes("brama zeglarska")) b.h = 16;
  else if (n.includes("teatr im")) b.h = 20;
  else if (n.includes("spichrz")) b.h = Math.max(b.h, 16);
  else if (n.includes("ratusz staromiejski")) b.h = 26;
  else if (n.includes("krzywa")) b.h = 16;
  else if (n.includes("dwór artusa") || n.includes("dwor artusa")) b.h = 18;
}

const raw = JSON.parse(readFileSync(join(root, "data/buildings.json"), "utf8"));
const elevBuf = readFileSync(join(root, "data/elev.f32"));
const size = elevBuf.readUInt32LE(0);
const elev = new Float32Array(elevBuf.buffer, elevBuf.byteOffset + 12, size * size);

function terrain(x, z) {
  const u = Math.min(1, Math.max(0, (x + W / 2) / W));
  const v = Math.min(1, Math.max(0, (z + W / 2) / W));
  const fx = u * (size - 1);
  const fy = v * (size - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (yy, xx) => elev[yy * size + xx] || 0;
  const a = at(y0, x0) * (1 - tx) + at(y0, x1) * tx;
  const b = at(y1, x0) * (1 - tx) + at(y1, x1) * tx;
  return (a * (1 - ty) + b * ty) * EXAG;
}
function shoelace(flat) {
  let a = 0;
  for (let i = 0; i < flat.length; i += 2) {
    const j = (i + 2) % flat.length;
    a += flat[i] * flat[j + 1] - flat[j] * flat[i + 1];
  }
  return a / 2;
}
function rev(flat) {
  const o = [];
  for (let i = flat.length - 2; i >= 0; i -= 2) o.push(flat[i], flat[i + 1]);
  return o;
}
function centroid(flat) {
  let x = 0, z = 0, n = flat.length / 2;
  for (let i = 0; i < flat.length; i += 2) {
    x += flat[i];
    z += flat[i + 1];
  }
  return [x / n, z / n];
}
function inside(flat, x, z) {
  let c = false;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const xi = flat[i], zi = flat[i + 1], xj = flat[j], zj = flat[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) c = !c;
  }
  return c;
}

const roofs = [];
const walls = [];
const GRID = 512;
const roofGrid = new Float32Array(GRID * GRID);
let used = 0;
let skipped = 0;

for (const b of raw.buildings) {
  tune(b);
  let p = b.p;
  if (!p || p.length < 6) {
    skipped++;
    continue;
  }
  const [cx, cz] = centroid(p);
  const dist = Math.hypot(cx + 420, cz + 880);
  if (dist > 2700 && b.h < 16) {
    skipped++;
    continue;
  }
  if (Math.abs(cx) > W / 2 - 20 || Math.abs(cz) > W / 2 - 20) {
    skipped++;
    continue;
  }
  if (shoelace(p) < 0) p = rev(p);
  const holes = (b.holes || []).map((h) => (shoelace(h) > 0 ? rev(h) : h));
  const data = p.slice();
  const holeIdx = [];
  for (const h of holes) {
    holeIdx.push(data.length / 2);
    data.push(...h);
  }
  const tris = earcut(data, holeIdx, 2);
  if (!tris || tris.length < 3) {
    skipped++;
    continue;
  }
  const y0 = terrain(cx, cz);
  const y1 = y0 + b.h * EXAG;
  const pushWall = (flat) => {
    for (let i = 0; i < flat.length; i += 2) {
      const x1 = flat[i], z1 = flat[i + 1];
      const j = (i + 2) % flat.length;
      const x2 = flat[j], z2 = flat[j + 1];
      const [r, g, bl] = wallColor((x1 + x2) / 2, (z1 + z2) / 2, b.k);
      walls.push(
        x1, y0, z1, r, g, bl,
        x2, y0, z2, r, g, bl,
        x2, y1, z2, r, g, bl,
        x1, y0, z1, r, g, bl,
        x2, y1, z2, r, g, bl,
        x1, y1, z1, r, g, bl,
      );
    }
  };
  pushWall(p);
  for (const h of holes) pushWall(h);

  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < minx) minx = p[i];
    if (p[i] > maxx) maxx = p[i];
    if (p[i + 1] < minz) minz = p[i + 1];
    if (p[i + 1] > maxz) maxz = p[i + 1];
  }
  const area = Math.max(0, maxx - minx) * Math.max(0, maxz - minz);
  const STEP = area < 700 ? 5 : area < 4000 ? 8 : 14;
  for (let x = minx; x < maxx - 0.2; x += STEP) {
    for (let z = minz; z < maxz - 0.2; z += STEP) {
      const mx = Math.min(x + STEP, maxx);
      const mz = Math.min(z + STEP, maxz);
      if (mx - x < 0.6 || mz - z < 0.6) continue;
      const sx = (x + mx) / 2;
      const sz = (z + mz) / 2;
      if (!inside(p, sx, sz)) continue;
      let inHole = false;
      for (const h of holes) if (inside(h, sx, sz)) { inHole = true; break; }
      if (inHole) continue;
      const [r, g, bl] = roofColor(sx, sz);
      roofs.push(
        x, y1, z, r, g, bl,
        mx, y1, z, r, g, bl,
        mx, y1, mz, r, g, bl,
        x, y1, z, r, g, bl,
        mx, y1, mz, r, g, bl,
        x, y1, mz, r, g, bl,
      );
    }
  }
  const i0 = Math.max(0, Math.floor(((minx + W / 2) / W) * (GRID - 1)));
  const i1 = Math.min(GRID - 1, Math.ceil(((maxx + W / 2) / W) * (GRID - 1)));
  const j0 = Math.max(0, Math.floor(((minz + W / 2) / W) * (GRID - 1)));
  const j1 = Math.min(GRID - 1, Math.ceil(((maxz + W / 2) / W) * (GRID - 1)));
  for (let j = j0; j <= j1; j++) {
    const z = (j / (GRID - 1)) * W - W / 2;
    for (let i = i0; i <= i1; i++) {
      const x = (i / (GRID - 1)) * W - W / 2;
      if (!inside(p, x, z)) continue;
      const idx = j * GRID + i;
      if (b.h > roofGrid[idx]) roofGrid[idx] = b.h;
    }
  }
  used++;
  if (used % 2500 === 0) console.log("progress", used);
}

console.log("used", used, "skipped", skipped, "roofVerts", roofs.length / 6, "wallVerts", walls.length / 6);
const chunks = [];
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  chunks.push(b);
}
function f32(arr) {
  const fa = Float32Array.from(arr);
  chunks.push(Buffer.from(fa.buffer));
}
chunks.push(Buffer.from("TOR3"));
u32(roofs.length / 6);
f32(roofs);
u32(walls.length / 6);
f32(walls);
u32(GRID);
const maxH = roofGrid.reduce((m, v) => (v > m ? v : m), 0) || 1;
const maxBuf = Buffer.alloc(4);
maxBuf.writeFloatLE(maxH);
chunks.push(maxBuf);
const bytes = Buffer.alloc(GRID * GRID);
for (let i = 0; i < roofGrid.length; i++) bytes[i] = Math.round((roofGrid[i] / maxH) * 255);
chunks.push(bytes);
const out = Buffer.concat(chunks);
writeFileSync(join(root, "public/flight/city.bin"), out);
const metaPath = join(root, "public/flight/meta.json");
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
meta.buildings = used;
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
console.log("bin MB", (out.length / 1e6).toFixed(2), "roofMax", maxH.toFixed(1), "buildings", used);
