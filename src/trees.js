// Instanced trees placed from OSM (forests, parks, tree rows, single trees) + canopy detected in the aerial photo.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'extras';

function colorize(geo, fn) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const [r, g, b] = fn(p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
function jitter(geo, amt, seed = 1) {
  const p = geo.attributes.position;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, [rnd() * amt, rnd() * amt, rnd() * amt]);
    const d = map.get(key);
    p.setXYZ(i, p.getX(i) * (1 + d[0]), p.getY(i) * (1 + d[1]), p.getZ(i) * (1 + d[2]));
  }
  return geo;
}

function makeDeciduous(detail) {
  const crown = jitter(new THREE.IcosahedronGeometry(0.5, detail), 0.22, 3 + detail);
  crown.scale(1, 0.74, 1); crown.translate(0, 0.64, 0);
  const parts = [colorize(crown, (x, y, z) => { const k = 0.55 + 0.45 * Math.min(1, Math.max(0, (y - 0.3) / 0.65)); return [k, k, k]; })];
  if (detail > 0) {
    const trunk = new THREE.CylinderGeometry(0.035, 0.05, 0.5, 5, 1, true); trunk.translate(0, 0.25, 0);
    parts.push(colorize(trunk, () => [0.28, 0.22, 0.17]));
  }
  const g = BufferGeometryUtils.mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p.index ? p.toNonIndexed() : p; }));
  g.computeVertexNormals();
  // soften normals: blend towards radial direction from crown centre (rounder light)
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) - 0.64, z = p.getZ(i);
    if (p.getY(i) < 0.3) continue;
    const l = Math.hypot(x, y / 0.74, z) || 1;
    const rx = x / l, ry = y / 0.74 / l, rz = z / l;
    const mx = n.getX(i) * 0.35 + rx * 0.65, my = n.getY(i) * 0.35 + ry * 0.65, mz = n.getZ(i) * 0.35 + rz * 0.65;
    const ml = Math.hypot(mx, my, mz) || 1;
    n.setXYZ(i, mx / ml, my / ml, mz / ml);
  }
  return g;
}

function makePine(detail) {
  const crown = jitter(new THREE.IcosahedronGeometry(0.5, detail), 0.25, 9 + detail);
  crown.scale(1, 0.62, 1); crown.translate(0, 0.78, 0);
  const parts = [colorize(crown, (x, y) => { const k = 0.6 + 0.5 * Math.min(1, Math.max(0, (y - 0.6) / 0.4)); return [k, k, k]; })];
  const trunk = new THREE.CylinderGeometry(0.025, 0.04, 0.7, detail > 0 ? 5 : 3, 1, true); trunk.translate(0, 0.35, 0);
  parts.push(colorize(trunk, () => [0.45, 0.28, 0.18]));
  const g = BufferGeometryUtils.mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p.index ? p.toNonIndexed() : p; }));
  g.computeVertexNormals();
  return g;
}

export function buildTrees(buf, city, terrain, obstacles) {
  const W = city.W, H = W / 2, G = 8, CS = W / G;
  const dv = new DataView(buf);
  const count = Math.floor(buf.byteLength / 7);
  const buckets = Array.from({ length: G * G * 2 }, () => []);
  for (let i = 0; i < count; i++) {
    const o = i * 7;
    const x = dv.getInt16(o, true) / 10, z = dv.getInt16(o + 2, true) / 10;
    const h = dv.getUint8(o + 4) / 8, r = dv.getUint8(o + 5) / 16, k = dv.getUint8(o + 6);
    const ci = Math.min(G - 1, Math.max(0, Math.floor((x + H) / CS))), cj = Math.min(G - 1, Math.max(0, Math.floor((z + H) / CS)));
    buckets[(cj * G + ci) * 2 + (k ? 1 : 0)].push([x, z, h, r, i]);
  }
  const geos = { d: [makeDeciduous(0), makeDeciduous(1)], p: [makePine(0), makePine(1)] };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.5 });
  const group = new THREE.Group(); group.name = 'trees';
  const chunks = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), yAxis = new THREE.Vector3(0, 1, 0);
  for (let b = 0; b < buckets.length; b++) {
    const list = buckets[b];
    if (!list.length) continue;
    const conifer = b % 2 === 1;
    const cell = (b / 2) | 0, ci = cell % G, cj = (cell / G) | 0;
    const meshes = [0, 1].map(lod => {
      const im = new THREE.InstancedMesh(conifer ? geos.p[lod] : geos.d[lod], mat, list.length);
      im.frustumCulled = true;
      return im;
    });
    list.forEach(([x, z, h, r, id], i) => {
      const y = terrain.heightAt(x, z) - 0.3;
      const rnd = Math.sin(id * 12.9898) * 43758.5453 % 1;
      q.setFromAxisAngle(yAxis, rnd * 6.283);
      const rr = conifer ? Math.max(r, h * 0.2) : r;
      s.set(rr * 2, h, rr * 2); p.set(x, y, z);
      m4.compose(p, q, s);
      if (conifer) c.setHSL(0.28 + 0.04 * rnd, 0.38 + 0.1 * Math.abs(rnd), 0.075 + 0.03 * Math.abs(rnd));
      else c.setHSL(0.19 + 0.07 * Math.abs(rnd), 0.42 + 0.2 * Math.abs(rnd), 0.085 + 0.05 * Math.abs(rnd));
      for (const im of meshes) { im.setMatrixAt(i, m4); im.setColorAt(i, c); }
      obstacles.fillDisc(x, z, rr * 0.7, y + h * 0.9);
    });
    for (const im of meshes) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); group.add(im); }
    meshes[1].castShadow = true;
    meshes[0].visible = false; meshes[1].visible = false;
    chunks.push({ meshes, cx: (ci + 0.5) * CS - H, cz: (cj + 0.5) * CS - H });
  }
  function update(cam, quality, enabled) {
    const nearD = quality === 'low' ? 700 : quality === 'med' ? 1100 : 1600;
    const farD = quality === 'low' ? 2600 : 5200;
    for (const ch of chunks) {
      const d = Math.max(0, Math.hypot(ch.cx - cam.x, ch.cz - cam.z) - CS * 0.7);
      const hi = enabled && d < nearD, lo = enabled && !hi && d < farD;
      ch.meshes[1].visible = hi; ch.meshes[0].visible = lo;
    }
  }
  return { group, update, count, mat };
}
