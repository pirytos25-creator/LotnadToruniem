// Data loading + terrain height lookup.
export const ORIGIN = { lat: 53.001562274591464, lon: 18.61083984375001, geoid: 31.5 };

export async function fetchBin(url, onProgress) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.arrayBuffer();
}
export async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export class Terrain {
  constructor(buf, meta) {
    const dv = new DataView(buf);
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== 'TRN1') throw new Error('bad terrain.bin');
    this.cn = dv.getUint32(4, true);
    this.cmin = dv.getFloat32(8, true);
    this.cscale = dv.getFloat32(12, true);
    this.fn = dv.getUint32(16, true);
    this.fmin = dv.getFloat32(20, true);
    this.fscale = dv.getFloat32(24, true);
    const c16 = new Uint16Array(buf, 28, this.cn * this.cn);
    const f16 = new Uint16Array(buf, 28 + this.cn * this.cn * 2, this.fn * this.fn);
    this.core = new Float32Array(c16.length);
    for (let i = 0; i < c16.length; i++) this.core[i] = this.cmin + c16[i] / this.cscale;
    this.far = new Float32Array(f16.length);
    for (let i = 0; i < f16.length; i++) this.far[i] = this.fmin + f16[i] / this.fscale;
    this.W = meta.W;
    this.H = meta.W / 2;
    this.farX0 = meta.ground.far.x0;
    this.farZ0 = meta.ground.far.z0;
    this.farSize = meta.ground.far.size;
  }
  inCore(x, z) { return Math.abs(x) <= this.H && Math.abs(z) <= this.H; }
  coreAt(x, z) {
    const n = this.cn;
    let fx = (x + this.H) / this.W * (n - 1), fz = (z + this.H) / this.W * (n - 1);
    fx = Math.min(Math.max(fx, 0), n - 1.0001); fz = Math.min(Math.max(fz, 0), n - 1.0001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, a = this.core;
    const h00 = a[j * n + i], h10 = a[j * n + i + 1], h01 = a[(j + 1) * n + i], h11 = a[(j + 1) * n + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }
  farAt(x, z) {
    const n = this.fn;
    let fx = (x - this.farX0) / this.farSize * (n - 1), fz = (z - this.farZ0) / this.farSize * (n - 1);
    fx = Math.min(Math.max(fx, 0), n - 1.0001); fz = Math.min(Math.max(fz, 0), n - 1.0001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, a = this.far;
    const h00 = a[j * n + i], h10 = a[j * n + i + 1], h01 = a[(j + 1) * n + i], h11 = a[(j + 1) * n + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }
  heightAt(x, z) { return this.inCore(x, z) ? this.coreAt(x, z) : this.farAt(x, z); }
}

// Obstacle heightfield (buildings, trees) over the core for collision + AGL.
export class Obstacles {
  constructor(W, n = 1024) {
    this.W = W; this.H = W / 2; this.n = n;
    this.h = new Float32Array(n * n);
  }
  cell(x, z) {
    const n = this.n;
    const i = Math.floor((x + this.H) / this.W * n), j = Math.floor((z + this.H) / this.W * n);
    if (i < 0 || j < 0 || i >= n || j >= n) return -1;
    return j * n + i;
  }
  at(x, z) { const c = this.cell(x, z); return c < 0 ? 0 : this.h[c]; }
  // max over a small neighbourhood (plane has a wingspan)
  near(x, z, r = 6) {
    let m = 0;
    for (let dz = -r; dz <= r; dz += r) for (let dx = -r; dx <= r; dx += r) m = Math.max(m, this.at(x + dx, z + dz));
    return m;
  }
  fillPolygon(ring, top) {
    // ring: flat [x,z,...]
    const n = this.n, cs = this.W / n;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      minx = Math.min(minx, ring[i]); maxx = Math.max(maxx, ring[i]);
      minz = Math.min(minz, ring[i + 1]); maxz = Math.max(maxz, ring[i + 1]);
    }
    const i0 = Math.max(0, Math.floor((minx + this.H) / cs)), i1 = Math.min(n - 1, Math.floor((maxx + this.H) / cs));
    const j0 = Math.max(0, Math.floor((minz + this.H) / cs)), j1 = Math.min(n - 1, Math.floor((maxz + this.H) / cs));
    const L = ring.length;
    for (let j = j0; j <= j1; j++) {
      const z = (j + 0.5) * cs - this.H;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * cs - this.H;
        let inside = false;
        for (let a = 0, b = L - 2; a < L; b = a, a += 2) {
          const xa = ring[a], za = ring[a + 1], xb = ring[b], zb = ring[b + 1];
          if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) inside = !inside;
        }
        if (inside) { const k = j * n + i; if (top > this.h[k]) this.h[k] = top; }
      }
      // small footprints: make sure at least the centre cell is marked
    }
    if (i0 === i1 || j0 === j1) {
      const k = this.cell((minx + maxx) / 2, (minz + maxz) / 2);
      if (k >= 0 && top > this.h[k]) this.h[k] = top;
    }
  }
  fillDisc(x, z, r, top) {
    const cs = this.W / this.n;
    for (let dz = -r; dz <= r; dz += cs) for (let dx = -r; dx <= r; dx += cs) {
      if (dx * dx + dz * dz > r * r) continue;
      const k = this.cell(x + dx, z + dz);
      if (k >= 0 && top > this.h[k]) this.h[k] = top;
    }
  }
}

// deterministic hash
export function hash1(n) { n = (n << 13) ^ n; return 1.0 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0; }
export function rand01(seed) { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
