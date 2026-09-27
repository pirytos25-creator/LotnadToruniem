// Bridges over the Vistula (and viaducts) from OSM bridge ways: decks, piers, steel trusses and arches.
import * as THREE from 'three';

class Mesher {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const v of [a, b, c]) { this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); }
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  // oriented box between two points, cross-section w (horizontal) x h (vertical-ish)
  beam(a, b, w, h, col) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length(); if (len < 1e-3) return; d.divideScalar(len);
    let side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0));
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
    const upv = new THREE.Vector3().crossVectors(side, d).normalize();
    const s = side.multiplyScalar(w / 2), u = upv.multiplyScalar(h / 2);
    const P = (base, sx, ux) => [base[0] + s.x * sx + u.x * ux, base[1] + s.y * sx + u.y * ux, base[2] + s.z * sx + u.z * ux];
    const a1 = P(a, -1, -1), a2 = P(a, 1, -1), a3 = P(a, 1, 1), a4 = P(a, -1, 1);
    const b1 = P(b, -1, -1), b2 = P(b, 1, -1), b3 = P(b, 1, 1), b4 = P(b, -1, 1);
    this.quad(a1, b1, b2, a2, col); this.quad(a2, b2, b3, a3, col); this.quad(a3, b3, b4, a4, col); this.quad(a4, b4, b1, a1, col);
    this.quad(a1, a2, a3, a4, col); this.quad(b1, b4, b3, b2, col);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

function chains(list) {
  // join ways sharing endpoints (same bridge split into several OSM ways)
  const items = list.map(b => ({ ...b, pts: Array.from({ length: b.p.length / 2 }, (_, i) => [b.p[i * 2], b.p[i * 2 + 1]]) }));
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.0;
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < items.length; i++) for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      const A = items[i], B = items[j];
      if (A.s !== B.s || A.rail !== B.rail || Math.abs(A.w - B.w) > 3) continue;
      let pts = null;
      if (close(A.pts[A.pts.length - 1], B.pts[0])) pts = A.pts.concat(B.pts.slice(1));
      else if (close(A.pts[A.pts.length - 1], B.pts[B.pts.length - 1])) pts = A.pts.concat(B.pts.slice(0, -1).reverse());
      else if (close(A.pts[0], B.pts[B.pts.length - 1])) pts = B.pts.concat(A.pts.slice(1));
      else if (close(A.pts[0], B.pts[0])) pts = B.pts.slice().reverse().concat(A.pts.slice(1));
      if (pts) { A.pts = pts; A.n = A.n || B.n; items.splice(j, 1); merged = true; break outer; }
    }
  }
  return items;
}

export function buildBridges(city, terrain, obstacles) {
  const m = new Mesher();
  const asphalt = new THREE.Color(0x404143), concrete = new THREE.Color(0x9a968e), steel = new THREE.Color(0x56675f), rail = new THREE.Color(0x5a5048);
  const steelRail = new THREE.Color(0x5e5a55), archCol = new THREE.Color(0xdedcd6);
  const WATER = 35.2;
  for (const br of chains(city.bridges)) {
    const P = br.pts;
    if (P.length < 2) continue;
    // resample to ~6 m steps
    const S = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(1, Math.ceil(len / 6));
      for (let t = 0; t < k; t++) S.push([a[0] + (b[0] - a[0]) * t / k, a[1] + (b[1] - a[1]) * t / k]);
    }
    S.push(P[P.length - 1]);
    const dist = [0]; for (let i = 1; i < S.length; i++) dist.push(dist[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
    const total = dist[dist.length - 1];
    if (total < 10) continue;
    const y0 = terrain.heightAt(S[0][0], S[0][1]) + 0.6, y1 = terrain.heightAt(S[S.length - 1][0], S[S.length - 1][1]) + 0.6;
    const clearance = total > 250 ? 9 : 5.5;
    let Y = S.map((p, i) => Math.max(y0 + (y1 - y0) * dist[i] / total, terrain.heightAt(p[0], p[1]) + clearance * Math.min(1, Math.min(dist[i], total - dist[i]) / 40)));
    for (let it = 0; it < 6; it++) Y = Y.map((y, i) => i === 0 || i === Y.length - 1 ? y : (Y[i - 1] + 2 * y + Y[i + 1]) / 4);
    const hw = br.w / 2, th = 1.6;
    const top = br.rail ? rail : asphalt;
    // side vectors
    const side = S.map((p, i) => {
      const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      return [dz / l, -dx / l];
    });
    const L = (i, s, dy = 0) => [S[i][0] + side[i][0] * hw * s, Y[i] + dy, S[i][1] + side[i][1] * hw * s];
    for (let i = 0; i < S.length - 1; i++) {
      const a = L(i, -1), b = L(i + 1, -1), c = L(i + 1, 1), d = L(i, 1);
      m.quad(a, d, c, b, top);                                     // deck top (faces up)
      m.quad(L(i, -1, -th), L(i + 1, -1, -th), L(i + 1, -1), L(i, -1), concrete);
      m.quad(L(i, 1, -th), L(i, 1), L(i + 1, 1), L(i + 1, 1, -th), concrete);
      m.quad(L(i, -1, -th), L(i, 1, -th), L(i + 1, 1, -th), L(i + 1, -1, -th), concrete);
      // parapets
      m.beam(L(i, -1, 1.0), L(i + 1, -1, 1.0), 0.15, 0.15, steelRail);
      m.beam(L(i, 1, 1.0), L(i + 1, 1, 1.0), 0.15, 0.15, steelRail);
      obstacles.fillPolygon([a[0], a[2], b[0], b[2], c[0], c[2], d[0], d[2]], Math.max(a[1], b[1]) + 1);
    }
    // piers + superstructure per span
    const span = br.s === 1 ? 96 : br.s === 2 ? 98 : br.s === 3 ? 60 : 38;
    const nSpan = Math.max(1, Math.round(total / span));
    const idxAt = (d) => { let i = 0; while (i < dist.length - 2 && dist[i + 1] < d) i++; return i; };
    for (let k = 0; k <= nSpan; k++) {
      const d = total * k / nSpan, i = idxAt(d);
      const x = S[i][0], z = S[i][1], g = terrain.heightAt(x, z);
      if (Y[i] - g < 3 || k === 0 || k === nSpan) continue;
      const sx = side[i][0], sz = side[i][1], fx = -sz, fz = sx;
      const w2 = hw + 0.8, d2 = br.s ? 3.2 : 1.6;
      const c1 = [x - sx * w2 - fx * d2, z - sz * w2 - fz * d2], c2 = [x + sx * w2 - fx * d2, z + sz * w2 - fz * d2];
      const c3 = [x + sx * w2 + fx * d2, z + sz * w2 + fz * d2], c4 = [x - sx * w2 + fx * d2, z - sz * w2 + fz * d2];
      const yb = g - 4, yt = Y[i] - th;
      for (const [a, b] of [[c1, c2], [c2, c3], [c3, c4], [c4, c1]]) m.quad([a[0], yb, a[1]], [b[0], yb, b[1]], [b[0], yt, b[1]], [a[0], yt, a[1]], concrete);
      // cut-water towers on truss bridges
    }
    if (br.s === 1 || br.s === 2 || br.s === 3) {
      for (let k = 0; k < nSpan; k++) {
        const d0 = total * k / nSpan, d1 = total * (k + 1) / nSpan;
        const iMid = idxAt((d0 + d1) / 2);
        const overWater = terrain.heightAt(S[iMid][0], S[iMid][1]) < WATER || br.s === 1;
        if (!overWater) continue;
        const panels = br.s === 3 ? 14 : 12;
        for (const sgn of [-1, 1]) {
          const nodes = [];
          for (let q = 0; q <= panels; q++) {
            const d = d0 + (d1 - d0) * q / panels, i = idxAt(d), t = (d - dist[i]) / Math.max(1e-3, dist[i + 1] - dist[i]);
            const x = S[i][0] + (S[i + 1][0] - S[i][0]) * t, z = S[i][1] + (S[i + 1][1] - S[i][1]) * t;
            const y = Y[i] + (Y[i + 1] - Y[i]) * t;
            const sx = side[i][0], sz = side[i][1];
            const u = q / panels;
            const hgt = br.s === 1 ? 2.5 + 10.5 * Math.sin(Math.PI * u) : br.s === 2 ? 11 : (d1 - d0) * 0.2 * Math.sin(Math.PI * u) + 0.5;
            const off = hw + (br.s === 3 ? -0.2 : 0.4);
            nodes.push({ b: [x + sx * off * sgn, y, z + sz * off * sgn], t: [x + sx * off * sgn, y + hgt, z + sz * off * sgn] });
          }
          const col = br.s === 3 ? archCol : steel;
          for (let q = 0; q < panels; q++) {
            const A = nodes[q], B = nodes[q + 1];
            m.beam(A.t, B.t, 0.7, br.s === 3 ? 1.6 : 0.8, col);                  // top chord / arch
            if (br.s !== 3) m.beam(A.b, B.b, 0.6, 0.9, col);                       // bottom chord
            m.beam(A.b, A.t, br.s === 3 ? 0.12 : 0.35, br.s === 3 ? 0.12 : 0.35, col); // verticals / hangers
            if (br.s !== 3) m.beam(q % 2 ? A.b : A.t, q % 2 ? B.t : B.b, 0.3, 0.3, col); // diagonals
          }
          const Z = nodes[panels]; m.beam(Z.b, Z.t, 0.35, 0.35, col);
          for (const nd of nodes) obstacles.fillDisc(nd.t[0], nd.t[2], 2, nd.t[1]);
        }
        // top bracing between the two trusses
        if (br.s !== 3) {
          for (let q = 1; q < panels; q += 2) {
            const d = d0 + (d1 - d0) * q / panels, i = idxAt(d);
            const u = q / panels, hgt = br.s === 1 ? 2.5 + 10.5 * Math.sin(Math.PI * u) : 11;
            if (hgt < 6) continue;
            const x = S[i][0], z = S[i][1], sx = side[i][0], sz = side[i][1], y = Y[i] + hgt, off = hw + 0.4;
            m.beam([x - sx * off, y, z - sz * off], [x + sx * off, y, z + sz * off], 0.3, 0.3, steel);
          }
        }
      }
    }
  }
  const geo = m.geometry();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.25, envMapIntensity: 0.8, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'bridges';
  return mesh;
}
