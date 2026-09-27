// Ground: 4x4 high-resolution aerial chunks over the city + wide low-res ring out to ~25 km.
import * as THREE from 'three';

export function buildGround(city, terrain, texLoader, quality) {
  const g = city.ground;
  const W = city.W, H = W / 2, N = g.chunks, CS = W / N;
  const n = terrain.cn;              // 513 vertices across the core
  const seg = (n - 1) / N;           // 128 segments per chunk
  const pad = g.pad / g.chunkTex, inner = 1 - 2 * pad;
  const group = new THREE.Group(); group.name = 'ground';
  const chunks = [];

  for (let cj = 0; cj < N; cj++) for (let ci = 0; ci < N; ci++) {
    const verts = (seg + 1) * (seg + 1);
    const skirt = 4 * (seg + 1);
    const pos = new Float32Array((verts + skirt) * 3), uv = new Float32Array((verts + skirt) * 2), nrm = new Float32Array((verts + skirt) * 3);
    let k = 0;
    const cell = W / (n - 1);
    for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
      const gi = ci * seg + i, gj = cj * seg + j;
      const x = gi * cell - H, z = gj * cell - H;
      const y = terrain.core[gj * n + gi];
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = pad + (i / seg) * inner; uv[k * 2 + 1] = 1 - (pad + (j / seg) * inner);
      // normal from central differences
      const hl = terrain.core[gj * n + Math.max(0, gi - 1)], hr = terrain.core[gj * n + Math.min(n - 1, gi + 1)];
      const hd = terrain.core[Math.max(0, gj - 1) * n + gi], hu = terrain.core[Math.min(n - 1, gj + 1) * n + gi];
      const nx = (hl - hr), nz = (hd - hu), ny = 2 * cell, l = Math.hypot(nx, ny, nz);
      nrm[k * 3] = nx / l; nrm[k * 3 + 1] = ny / l; nrm[k * 3 + 2] = nz / l;
      k++;
    }
    const idx = [];
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // skirts along the 4 edges (hide cracks against neighbours / far ring)
    const edges = [
      Array.from({ length: seg + 1 }, (_, i) => i),
      Array.from({ length: seg + 1 }, (_, i) => seg * (seg + 1) + i),
      Array.from({ length: seg + 1 }, (_, j) => j * (seg + 1)),
      Array.from({ length: seg + 1 }, (_, j) => j * (seg + 1) + seg),
    ];
    for (const e of edges) {
      const start = k;
      for (const v of e) {
        pos[k * 3] = pos[v * 3]; pos[k * 3 + 1] = pos[v * 3 + 1] - 25; pos[k * 3 + 2] = pos[v * 3 + 2];
        uv[k * 2] = uv[v * 2]; uv[k * 2 + 1] = uv[v * 2 + 1];
        nrm[k * 3 + 1] = 1; k++;
      }
      for (let q = 0; q < e.length - 1; q++) { idx.push(e[q], start + q, e[q + 1], e[q + 1], start + q, start + q + 1); idx.push(e[q], e[q + 1], start + q, e[q + 1], start + q + 1, start + q); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.97, metalness: 0, color: 0xffffff, envMapIntensity: 0.35 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = `ground${cj}${ci}`;
    group.add(mesh);
    const photo = { value: null };
    chunks.push({ mesh, mat, ci, cj, hi: false, photo, x0: ci * CS - H, z0: cj * CS - H, size: CS, pad, cx: (ci + 0.5) * CS - H, cz: (cj + 0.5) * CS - H });
    // low-res first
    texLoader.load(`assets/ground/l${cj}${ci}.jpg`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      if (!mat.map) { mat.map = t; mat.needsUpdate = true; photo.value = t; }
    });
  }

  // far ring
  const f = g.far, fn = terrain.fn;
  const fcell = f.size / (fn - 1);
  const c0 = Math.round((-H - f.x0) / fcell), c1 = Math.round((H - f.x0) / fcell);
  const fpos = new Float32Array(fn * fn * 3), fuv = new Float32Array(fn * fn * 2);
  for (let j = 0; j < fn; j++) for (let i = 0; i < fn; i++) {
    const k = j * fn + i;
    const x = f.x0 + i * fcell, z = f.z0 + j * fcell;
    let y = terrain.far[k];
    const onEdge = i >= c0 && i <= c1 && j >= c0 && j <= c1;
    if (onEdge) y = terrain.coreAt(x, z) - 1.0;
    // curvature drop so the horizon rolls away
    const d2 = x * x + z * z; y -= d2 / (2 * 6371000);
    fpos[k * 3] = x; fpos[k * 3 + 1] = y; fpos[k * 3 + 2] = z;
    fuv[k * 2] = i / (fn - 1); fuv[k * 2 + 1] = 1 - j / (fn - 1);
  }
  const fidx = [];
  for (let j = 0; j < fn - 1; j++) for (let i = 0; i < fn - 1; i++) {
    if (i >= c0 && i < c1 && j >= c0 && j < c1) continue;
    const a = j * fn + i, b = a + 1, c = a + fn, d = c + 1;
    fidx.push(a, c, b, b, c, d);
  }
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fgeo.setAttribute('uv', new THREE.BufferAttribute(fuv, 2));
  fgeo.setIndex(fidx);
  fgeo.computeVertexNormals();
  const fmat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: 0.3 });
  texLoader.load('assets/far.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; fmat.map = t; fmat.needsUpdate = true; });
  const far = new THREE.Mesh(fgeo, fmat);
  far.receiveShadow = false; far.name = 'far';
  group.add(far);

  // endless horizon disc beyond the far ring, same tone as the landscape
  const disc = new THREE.Mesh(new THREE.RingGeometry(21000, 120000, 64, 1), new THREE.MeshBasicMaterial({ color: 0x4b5a3c, fog: true }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 20; disc.name = 'horizon';
  group.add(disc);

  // progressive high-res texture streaming by distance
  const loading = new Set();
  function update(camPos) {
    const maxHi = quality.value === 'low' ? 0 : 16;
    const list = chunks.map(c => ({ c, d: Math.hypot(c.cx - camPos.x, c.cz - camPos.z) })).sort((a, b) => a.d - b.d);
    let count = 0;
    for (const { c, d } of list) {
      if (!c.hi && !loading.has(c) && count < maxHi && d < 5200) {
        loading.add(c);
        texLoader.load(`assets/ground/g${c.cj}${c.ci}.jpg`, (t) => {
          t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
          const old = c.mat.map; c.mat.map = t; c.mat.needsUpdate = true; c.hi = true; loading.delete(c); c.photo.value = t;
          if (old) old.dispose();
        }, undefined, () => loading.delete(c));
      }
      if (c.hi || loading.has(c)) count++;
    }
  }
  return { group, chunks, update, far, disc };
}

// ---------------------------------------------------------------- water
export function buildWater(city, terrain, maskTex, normals) {
  const H = city.W / 2, W = city.W;
  const group = new THREE.Group(); group.name = 'water';
  const mat = new THREE.MeshStandardMaterial({
    color: 0x27423f, roughness: 0.04, metalness: 0.0, transparent: true, envMapIntensity: 2.6,
    normalMap: normals, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false,
  });
  mat.normalMap.repeat.set(1, 1);
  maskTex.channel = 1; maskTex.colorSpace = THREE.NoColorSpace; mat.alphaMap = maskTex;
  const timeU = { value: 0 };
  mat.onBeforeCompile = (s) => {
    s.uniforms.uT = timeU;
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT;')
      .replace('#include <normal_fragment_maps>', `
      {
        vec2 wuv = vNormalMapUv;
        vec3 n1 = texture2D(normalMap, wuv * 1.0 + vec2(uT * 0.011, uT * 0.007)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, wuv * 2.7 + vec2(-uT * 0.017, uT * 0.013)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(normalMap, wuv * 0.23 + vec2(uT * 0.003, -uT * 0.002)).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3((n1.xy + n2.xy * 0.6 + n3.xy * 0.8) * normalScale, 1.0));
        normal = normalize( tbn * mapN );
      }`)
      .replace('#include <alphamap_fragment>', `#ifdef USE_ALPHAMAP
      diffuseColor.a *= smoothstep(0.1, 0.6, texture2D(alphaMap, vAlphaMapUv).g) * 0.96;
      #endif`);
  };
  mat.customProgramCacheKey = () => 'water';
  for (const w of city.water) {
    const shape = new THREE.Shape();
    const p = w.p;
    // Shape lives in (x, -z) so the geometry faces +y after rotation
    for (let i = 0; i < p.length; i += 2) (i ? shape.lineTo(p[i], -p[i + 1]) : shape.moveTo(p[i], -p[i + 1]));
    for (const h of w.h) {
      const path = new THREE.Path();
      for (let i = 0; i < h.length; i += 2) (i ? path.lineTo(h[i], -h[i + 1]) : path.moveTo(h[i], -h[i + 1]));
      shape.holes.push(path);
    }
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2), uv1 = new Float32Array(pos.count * 2);
    const [a, b, c] = w.lvl;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, a * x + b * z + c);
      uv[i * 2] = x / 90; uv[i * 2 + 1] = z / 90;
      uv1[i * 2] = (x + H) / W; uv1[i * 2 + 1] = 1 - (z + H) / W;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    geo.computeVertexNormals();
    // tangents for normal map: planar, so default tbn via derivatives is fine
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    group.add(m);
  }
  return { group, mat, timeU };
}
