// Building geometry from baked OSM footprints: textured walls, pitched/hipped/pyramidal/dome roofs.
import * as THREE from 'three';
import { earcut } from 'extras';
import { FACADE } from './textures.js';

export class Builder {
  constructor(cap = 4096) {
    this.cap = cap; this.n = 0; this.ni = 0;
    this.pos = new Float32Array(cap * 3); this.nrm = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    this.uv = new Float32Array(cap * 2); this.info = new Float32Array(cap * 2);
    this.idx = new Uint32Array(cap * 2);
  }
  grow(needV, needI) {
    if (this.n + needV > this.cap) {
      const cap = Math.max(this.cap * 2, this.n + needV);
      const g = (a, k) => { const b = new Float32Array(cap * k); b.set(a); return b; };
      this.pos = g(this.pos, 3); this.nrm = g(this.nrm, 3); this.col = g(this.col, 3); this.uv = g(this.uv, 2); this.info = g(this.info, 2);
      this.cap = cap;
    }
    if (this.ni + needI > this.idx.length) { const b = new Uint32Array(Math.max(this.idx.length * 2, this.ni + needI)); b.set(this.idx); this.idx = b; }
  }
  v(x, y, z, nx, ny, nz, c, u, w, t, s) {
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.nrm[i * 3] = nx; this.nrm[i * 3 + 1] = ny; this.nrm[i * 3 + 2] = nz;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = w; this.info[i * 2] = t; this.info[i * 2 + 1] = s;
    return i;
  }
  t(a, b, c) { this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.slice(0, this.n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, this.n * 3), 3));
    g.setAttribute('aUv', new THREE.BufferAttribute(this.uv.slice(0, this.n * 2), 2));
    g.setAttribute('aInfo', new THREE.BufferAttribute(this.info.slice(0, this.n * 2), 2));
    g.setIndex(new THREE.BufferAttribute(this.idx.slice(0, this.ni), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();

// polygon with explicit (possibly non-planar-normal) orientation check
function triOriented(B, p, q, r, uvs, col, tile, seed, up = true, forcedN = null) {
  _a.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  _b.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]);
  _n.crossVectors(_a, _b);
  if (_n.lengthSq() < 1e-10) return;
  _n.normalize();
  let flip = false;
  if (forcedN) { if (_n.dot(forcedN) < 0) flip = true; }
  else if (up && _n.y < 0) flip = true;
  if (flip) _n.negate();
  const n = forcedN || _n;
  B.grow(3, 3);
  const i0 = B.v(p[0], p[1], p[2], n.x, n.y, n.z, col, uvs[0], uvs[1], tile, seed);
  const i1 = B.v(q[0], q[1], q[2], n.x, n.y, n.z, col, uvs[2], uvs[3], tile, seed);
  const i2 = B.v(r[0], r[1], r[2], n.x, n.y, n.z, col, uvs[4], uvs[5], tile, seed);
  if (flip) B.t(i0, i2, i1); else B.t(i0, i1, i2);
}

// quad p0,p1 bottom (a->b), p2,p3 top (b,a) with outward normal n
function quad(B, p0, p1, p2, p3, n, col, uv, tile, seed) {
  B.grow(4, 6);
  const i0 = B.v(p0[0], p0[1], p0[2], n.x, n.y, n.z, col, uv[0], uv[1], tile, seed);
  const i1 = B.v(p1[0], p1[1], p1[2], n.x, n.y, n.z, col, uv[2], uv[3], tile, seed);
  const i2 = B.v(p2[0], p2[1], p2[2], n.x, n.y, n.z, col, uv[4], uv[5], tile, seed);
  const i3 = B.v(p3[0], p3[1], p3[2], n.x, n.y, n.z, col, uv[6], uv[7], tile, seed);
  _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  _b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
  _c.crossVectors(_a, _b);
  if (_c.dot(n) >= 0) { B.t(i0, i1, i2); B.t(i0, i2, i3); } else { B.t(i0, i2, i1); B.t(i0, i3, i2); }
}

const colTmp = new THREE.Color();
function lin(hex) { return new THREE.Color().setHex(parseInt(hex, 16)); }

function roofTile(hex, pitched) {
  const c = parseInt(hex, 16), r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  if (g > r * 1.05 && g > b * 0.9 && g - r > 8) return 2;         // copper / green metal
  if (!pitched) return 1;
  if (r > g * 1.12 && r > b * 1.2) return 0;                        // ceramic
  return 3;                                                          // slate / dark
}

function insetRing(pts, d) {
  // pts: [[x,z],...] CCW. Returns inset ring or null if it degenerates.
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    let e1x = p1[0] - p0[0], e1z = p1[1] - p0[1], e2x = p2[0] - p1[0], e2z = p2[1] - p1[1];
    const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
    e1x /= l1; e1z /= l1; e2x /= l2; e2z /= l2;
    // inward normals (left side for CCW): (-dz, dx)
    const n1x = -e1z, n1z = e1x, n2x = -e2z, n2z = e2x;
    let bx = n1x + n2x, bz = n1z + n2z; const bl = Math.hypot(bx, bz);
    if (bl < 1e-6) return null;
    bx /= bl; bz /= bl;
    const cos = bx * n1x + bz * n1z;
    if (cos < 0.35) return null; // too sharp
    out.push([p1[0] + bx * d / cos, p1[1] + bz * d / cos]);
  }
  // edges must keep direction
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], c = out[i], e = out[(i + 1) % n];
    const dot = (b[0] - a[0]) * (e[0] - c[0]) + (b[1] - a[1]) * (e[1] - c[1]);
    if (dot <= 0) return null;
  }
  let area = 0;
  for (let i = 0; i < n; i++) { const a = out[i], b = out[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area <= 0) return null;
  return out;
}

const OLD_TOWN = [[-700, -715], [-420, -735], [-110, -760], [40, -830], [210, -930], [280, -1060], [260, -1245], [-60, -1285], [-420, -1255], [-660, -1215], [-730, -990]];
export function inOldTown(x, z) {
  let inside = false;
  for (let i = 0, j = OLD_TOWN.length - 1; i < OLD_TOWN.length; j = i++) {
    const [xi, zi] = OLD_TOWN[i], [xj, zj] = OLD_TOWN[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function buildCity(city, terrain, obstacles, opts = {}) {
  const W = city.W, H = W / 2, N = 4, CS = W / N;
  const walls = [], roofs = [];
  for (let i = 0; i < N * N; i++) { walls.push(new Builder(60000)); roofs.push(new Builder(30000)); }
  const units = FACADE.unit;
  const up = new THREE.Vector3(0, 1, 0);
  const nTmp = new THREE.Vector3();
  const named = [];

  city.buildings.forEach((b, bi) => {
    let ring = b.p;
    const nPts = ring.length / 2;
    if (nPts < 3) return;
    // centroid / bbox
    let cx = 0, cz = 0;
    for (let i = 0; i < ring.length; i += 2) { cx += ring[i]; cz += ring[i + 1]; }
    cx /= nPts; cz /= nPts;
    const ci = Math.min(N - 1, Math.max(0, Math.floor((cx + H) / CS))), cj = Math.min(N - 1, Math.max(0, Math.floor((cz + H) / CS)));
    const WB = walls[cj * N + ci], RB = roofs[cj * N + ci];
    const seed = (bi % 997) + 1;

    let pitched = b.rs !== 0 && b.rh > 0.5;
    let pts = [];
    if (b.o && pitched) {
      const [ox, oz, ang, L, Wd] = b.o;
      const ax = Math.cos(ang), az = Math.sin(ang), bx = -az, bz = ax;
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [ox + ax * L / 2 * s + bx * Wd / 2 * t, oz + az * L / 2 * s + bz * Wd / 2 * t]);
      // ensure CCW
      let ar = 0; for (let i = 0; i < 4; i++) { const p = c[i], q = c[(i + 1) % 4]; ar += p[0] * q[1] - q[0] * p[1]; }
      pts = ar > 0 ? c : c.reverse();
    } else {
      for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
    }
    let ground = Infinity;
    for (const p of pts) ground = Math.min(ground, terrain.heightAt(p[0], p[1]));
    ground = Math.min(ground, terrain.heightAt(cx, cz));
    if (ground < 33.6 && b.h > 6) b.h = 5.5; // moored barges / boats standing in the river
    const top = ground + b.h;
    const eave = pitched ? top - b.rh : top;
    const bottom = b.mh > 0.5 ? ground + b.mh : ground - 2.5;
    const wc = lin(b.wc), rc = lin(b.rc);
    if (b.s === 1) { // brick: keep tagged colours in a believable brick range
      const hsl = {}; wc.getHSL(hsl); wc.setHSL(THREE.MathUtils.clamp(hsl.h, 0.0, 0.06) || 0.03, Math.min(hsl.s, 0.55), THREE.MathUtils.clamp(hsl.l, 0.06, 0.2));
    }
    const style = b.s;
    const [bw, fh] = units[style];
    const lean = b.lean;
    const L = (x, y, z) => lean ? [x + (y - ground) * lean[0], y, z + (y - ground) * lean[1]] : [x, y, z];
    const roofT = roofTile(b.rc, pitched);
    {
      const hsl = {}; rc.getHSL(hsl);
      if (roofT === 3 || roofT === 1) rc.setHSL(hsl.h, hsl.s * 0.25, hsl.l);            // grey roofs: kill the photo's green cast
      else if (roofT === 0) rc.setHSL(THREE.MathUtils.clamp(hsl.h, 0.018, 0.05), THREE.MathUtils.clamp(hsl.s, 0.42, 0.62), THREE.MathUtils.clamp(hsl.l, 0.1, 0.2));
    }

    obstacles.fillPolygon(ring, top);
    if (b.n) named.push({ name: b.n, x: cx, z: cz, top });

    const rings = [pts];
    if (b.ho && !(b.o && pitched)) for (const h of b.ho) { const r = []; for (let i = 0; i < h.length; i += 2) r.push([h[i], h[i + 1]]); rings.push(r); }

    // ---------- walls
    const wallTop = eave;
    for (const r of rings) {
      const n = r.length;
      for (let i = 0; i < n; i++) {
        const a = r[i], c = r[(i + 1) % n];
        const dx = c[0] - a[0], dz = c[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len < 0.05) continue;
        nTmp.set(dz / len, 0, -dx / len);
        const bays = Math.max(1, Math.round(len / bw));
        const v0 = (bottom - ground) / fh, v1 = (wallTop - ground) / fh;
        quad(WB, L(a[0], bottom, a[1]), L(c[0], bottom, c[1]), L(c[0], wallTop, c[1]), L(a[0], wallTop, a[1]), nTmp, wc,
          [0, v0, bays, v0, bays, v1, 0, v1], style, seed);
      }
    }

    // ---------- roofs
    const rs = b.rs;
    const addFlat = (y, rr, color, tile) => {
      const flat = [], holes = [];
      for (let k = 0; k < rr.length; k++) {
        if (k > 0) holes.push(flat.length / 2);
        for (const p of rr[k]) flat.push(p[0], p[1]);
      }
      const tris = earcut(flat, holes.length ? holes : undefined, 2);
      RB.grow(flat.length / 2, tris.length);
      const base = RB.n;
      for (let i = 0; i < flat.length; i += 2) {
        const P = L(flat[i], y, flat[i + 1]);
        RB.v(P[0], P[1], P[2], 0, 1, 0, color, flat[i] / 6, flat[i + 1] / 6, tile, seed);
      }
      for (let i = 0; i < tris.length; i += 3) {
        // earcut returns CW/CCW depending on input; make it face up
        const a = tris[i], c = tris[i + 1], d = tris[i + 2];
        const ax = flat[a * 2], az = flat[a * 2 + 1], bx = flat[c * 2], bz = flat[c * 2 + 1], ex = flat[d * 2], ez = flat[d * 2 + 1];
        const cross = (bx - ax) * (ez - az) - (bz - az) * (ex - ax);
        // y-up normal requires cross (in x,z) < 0 for three's right-handed coords
        if (cross < 0) RB.t(base + a, base + c, base + d); else RB.t(base + a, base + d, base + c);
      }
    };

    const slopeUV = (P, ex, ez, sx, sz) => [(P[0] * ex + P[2] * ez) / 2.2, (P[0] * sx + P[2] * sz + P[1]) / 2.2];

    if (!pitched) {
      addFlat(top, rings, rc, roofT);
      // parapet on bigger flat roofs
      if (rings[0].length >= 4 && b.h > 7 && style !== 6) {
        const r = rings[0], n = r.length;
        for (let i = 0; i < n; i++) {
          const a = r[i], c = r[(i + 1) % n];
          const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
          if (len < 0.3) continue;
          nTmp.set(dz / len, 0, -dx / len);
          const bays = Math.max(1, Math.round(len / bw));
          quad(WB, L(a[0], top, a[1]), L(c[0], top, c[1]), L(c[0], top + 0.7, c[1]), L(a[0], top + 0.7, a[1]), nTmp, wc,
            [0, 0.02, bays, 0.02, bays, 0.05, 0, 0.05], style, seed);
          nTmp.negate();
          quad(RB, L(a[0], top, a[1]), L(c[0], top, c[1]), L(c[0], top + 0.7, c[1]), L(a[0], top + 0.7, a[1]), nTmp, rc,
            [0, 0, len / 6, 0, len / 6, 0.1, 0, 0.1], 1, seed);
        }
      }
    } else if (b.o && (rs === 1 || rs === 2 || rs === 5 || rs === 7)) {
      const [ox, oz, ang, Lr, Wd] = b.o;
      const ax = Math.cos(ang), az = Math.sin(ang), bx = -az, bz = ax;
      const hl = Lr / 2, hw = Wd / 2;
      const stepped = (style === 0 || style === 1) && rs === 1 && Wd < 17 && b.rh > 3 && inOldTown(cx, cz);
      const ovA = stepped ? -0.3 : 0.3, ovB = 0.45;
      const slope = b.rh / hw;
      const P = (s, t, y) => L(ox + ax * s + bx * t, y, oz + az * s + bz * t);
      const yEdge = eave - ovB * slope;
      if (rs === 5) {
        // skillion: rises from -b side (eave) to +b side (top)
        const y0 = eave, y1 = top;
        const p0 = P(-hl - ovA, -hw - ovB, y0 - ovB * (y1 - y0) / Wd), p1 = P(hl + ovA, -hw - ovB, y0 - ovB * (y1 - y0) / Wd);
        const p2 = P(hl + ovA, hw + ovB, y1 + ovB * (y1 - y0) / Wd), p3 = P(-hl - ovA, hw + ovB, y1 + ovB * (y1 - y0) / Wd);
        const uvs = [p0, p1, p2, p3].map(q => slopeUV(q, ax, az, bx, bz)).flat();
        triOriented(RB, p0, p1, p2, [uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5]], rc, roofT, seed);
        triOriented(RB, p0, p2, p3, [uvs[0], uvs[1], uvs[4], uvs[5], uvs[6], uvs[7]], rc, roofT, seed);
        // side triangles (walls)
        for (const s of [-1, 1]) {
          const a = P(s * hl, -hw, y0), c = P(s * hl, hw, y0), d = P(s * hl, hw, y1);
          nTmp.set(ax * s, 0, az * s);
          triOriented(WB, a, c, d, [0, (y0 - ground) / fh, Wd / bw, (y0 - ground) / fh, Wd / bw, (y1 - ground) / fh], wc, style, seed, false, nTmp);
        }
        const a = P(-hl, hw, y0), c = P(hl, hw, y0), d = P(hl, hw, y1), e = P(-hl, hw, y1);
        nTmp.set(bx, 0, bz);
        quad(WB, a, c, d, e, nTmp, wc, [0, (y0 - ground) / fh, Lr / bw, (y0 - ground) / fh, Lr / bw, (y1 - ground) / fh, 0, (y1 - ground) / fh], style, seed);
      } else {
        const hip = rs === 2 || rs === 7;
        const rl = hip ? Math.max(0, hl - hw * 0.9) : hl + ovA; // ridge half length
        for (const t of [-1, 1]) {
          // long slopes
          const e0 = P(-hl - ovA, t * (hw + ovB), yEdge), e1 = P(hl + ovA, t * (hw + ovB), yEdge);
          const r1 = P(rl, 0, top), r0 = P(-rl, 0, top);
          const q = [e0, e1, r1, r0];
          const uv = q.map(p => slopeUV(p, ax, az, -bx * t, -bz * t)).flat();
          triOriented(RB, e0, e1, r1, [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]], rc, roofT, seed);
          if (rl > 0.01 || !hip) triOriented(RB, e0, r1, r0, [uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]], rc, roofT, seed);
        }
        for (const s of [-1, 1]) {
          if (hip) {
            const e0 = P(s * (hl + ovA), -hw - ovB, yEdge), e1 = P(s * (hl + ovA), hw + ovB, yEdge), r = P(s * rl, 0, top);
            const uv = [e0, e1, r].map(p => slopeUV(p, bx, bz, -ax * s, -az * s)).flat();
            triOriented(RB, e0, e1, r, uv, rc, roofT, seed);
          } else {
            // gable wall triangle
            const inset = stepped ? 0.12 : 0;
            const a = P(s * (hl - inset), -hw, eave), c = P(s * (hl - inset), hw, eave), d = P(s * (hl - inset), 0, top);
            nTmp.set(ax * s, 0, az * s);
            const v0 = (eave - ground) / fh, v1 = (top - ground) / fh, bays = Math.max(1, Math.round(Wd / bw));
            triOriented(WB, a, c, d, [0, v0, bays, v0, bays / 2, v1], wc, style === 1 ? 7 : style, seed, false, nTmp);
            if (stepped) {
              // Gothic crow-stepped gable (Toruń Old Town): brick steps rising above the roof line
              const nSt = Math.max(4, Math.min(8, Math.round(b.rh / 1.5)));
              const dy = (top - eave) / nSt, depth = 0.55;
              const nOut = new THREE.Vector3(ax * s, 0, az * s), nIn = nOut.clone().negate();
              const nSide = new THREE.Vector3(bx, 0, bz), nSide2 = nSide.clone().negate();
              const scol = style === 1 ? wc : wc.clone().lerp(new THREE.Color(0.3, 0.09, 0.05), 0.35);
              for (let k = 0; k < nSt; k++) {
                const y0s = eave + k * dy, y1s = k === nSt - 1 ? top + 1.3 : eave + (k + 1) * dy;
                const w = k === nSt - 1 ? 0.45 : hw * (1 - (k + 1) / nSt) + 0.55;
                const fo = s * hl, fi = s * (hl - depth);
                const uvF = [-w / 2, y0s / 2, w / 2, y0s / 2, w / 2, y1s / 2, -w / 2, y1s / 2];
                quad(WB, P(fo, -w, y0s), P(fo, w, y0s), P(fo, w, y1s), P(fo, -w, y1s), nOut, scol, uvF, k < 2 && style === 1 ? 1 : 7, seed);
                quad(WB, P(fi, -w, y0s), P(fi, w, y0s), P(fi, w, y1s), P(fi, -w, y1s), nIn, scol, uvF, 7, seed);
                quad(WB, P(fo, -w, y1s), P(fo, w, y1s), P(fi, w, y1s), P(fi, -w, y1s), up, scol, [0, 0, w, 0, w, 0.2, 0, 0.2], 7, seed);
                quad(WB, P(fo, w, y0s), P(fi, w, y0s), P(fi, w, y1s), P(fo, w, y1s), nSide, scol, [0, y0s / 2, 0.3, y0s / 2, 0.3, y1s / 2, 0, y1s / 2], 7, seed);
                quad(WB, P(fo, -w, y0s), P(fi, -w, y0s), P(fi, -w, y1s), P(fo, -w, y1s), nSide2, scol, [0, y0s / 2, 0.3, y0s / 2, 0.3, y1s / 2, 0, y1s / 2], 7, seed);
              }
            }
          }
        }
      }
    } else if (rs === 3 || rs === 6 || ((rs === 1 || rs === 2 || rs === 7) && pts.length <= 5 && !b.o)) {
      // pyramid / spire towards centroid
      const r = rings[0], n = r.length;
      let px = 0, pz = 0; for (const p of r) { px += p[0]; pz += p[1]; } px /= n; pz /= n;
      const apex = L(px, top, pz);
      for (let i = 0; i < n; i++) {
        const a = r[i], c = r[(i + 1) % n];
        const A = L(a[0], eave, a[1]), C = L(c[0], eave, c[1]);
        const ex = c[0] - a[0], ez = c[1] - a[1], el = Math.hypot(ex, ez) || 1;
        const uv = [A, C, apex].map(p => slopeUV(p, ex / el, ez / el, ez / el, -ex / el)).flat();
        triOriented(RB, A, C, apex, uv, rc, roofT, seed);
      }
    } else if (rs === 4) {
      // dome: shrink rings towards centroid
      const r = rings[0], n = r.length;
      let px = 0, pz = 0; for (const p of r) { px += p[0]; pz += p[1]; } px /= n; pz /= n;
      const K = 6;
      let prev = r.map(p => L(p[0], eave, p[1]));
      for (let k = 1; k <= K; k++) {
        const th = k / K * Math.PI / 2, s = Math.cos(th), y = eave + b.rh * Math.sin(th);
        const cur = r.map(p => L(px + (p[0] - px) * s, y, pz + (p[1] - pz) * s));
        for (let i = 0; i < n; i++) {
          const a = prev[i], c = prev[(i + 1) % n], d = cur[(i + 1) % n], e = cur[i];
          triOriented(RB, a, c, d, [0, k - 1, 1, k - 1, 1, k], rc, 2, seed);
          if (k < K) triOriented(RB, a, d, e, [0, k - 1, 1, k, 0, k], rc, 2, seed);
        }
        prev = cur;
      }
    } else {
      // generic pitched roof on an arbitrary footprint: sloped band + flat cap (mansard-like)
      const outer = rings[0];
      const d = Math.min(4.5, Math.max(1.2, b.rh * 0.8));
      const inner = rings.length === 1 ? insetRing(outer, d) : null;
      if (inner) {
        const yTop = eave + Math.min(b.rh, d * 1.25);
        const n = outer.length;
        for (let i = 0; i < n; i++) {
          const a = outer[i], c = outer[(i + 1) % n], e = inner[(i + 1) % n], f = inner[i];
          const A = L(a[0], eave, a[1]), C = L(c[0], eave, c[1]), E = L(e[0], yTop, e[1]), F = L(f[0], yTop, f[1]);
          const ex = c[0] - a[0], ez = c[1] - a[1], el = Math.hypot(ex, ez) || 1;
          const uv = [A, C, E, F].map(p => slopeUV(p, ex / el, ez / el, ez / el, -ex / el)).flat();
          triOriented(RB, A, C, E, [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]], rc, roofT, seed);
          triOriented(RB, A, E, F, [uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]], rc, roofT, seed);
        }
        addFlat(yTop, [inner], rc, roofT);
      } else {
        addFlat(eave, rings, rc, roofT === 0 ? 3 : roofT);
      }
    }
  });

  // ---------- city walls (brick)
  const brick = lin('6f3a2b');
  for (const w of city.walls) {
    const p = w.p;
    const ci = Math.min(N - 1, Math.max(0, Math.floor((p[0] + H) / CS))), cj = Math.min(N - 1, Math.max(0, Math.floor((p[1] + H) / CS)));
    const WB = walls[cj * N + ci], RB = roofs[cj * N + ci];
    const t = w.t / 2;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.2) continue;
      const nx = dz / len, nz = -dx / len;
      const ga = terrain.heightAt(ax, az), gb = terrain.heightAt(bx, bz);
      const ta = ga + w.h, tb = gb + w.h;
      for (const s of [1, -1]) {
        nTmp.set(nx * s, 0, nz * s);
        const A = [ax + nx * t * s, ga - 2, az + nz * t * s], B = [bx + nx * t * s, gb - 2, bz + nz * t * s];
        quad(WB, A, B, [B[0], tb, B[2]], [A[0], ta, A[2]], nTmp, brick, [0, -0.5, len / 4, -0.5, len / 4, w.h / 4, 0, w.h / 4], 7, 3);
      }
      const A1 = [ax + nx * t, ta, az + nz * t], B1 = [bx + nx * t, tb, bz + nz * t], A2 = [ax - nx * t, ta, az - nz * t], B2 = [bx - nx * t, tb, bz - nz * t];
      quad(RB, A1, B1, B2, A2, up, lin('5a3226'), [0, 0, len / 2, 0, len / 2, 1, 0, 1], 3, 3);
      obstacles.fillPolygon([A1[0], A1[2], B1[0], B1[2], B2[0], B2[2], A2[0], A2[2]], Math.max(ta, tb));
    }
  }

  return { walls, roofs, named };
}
