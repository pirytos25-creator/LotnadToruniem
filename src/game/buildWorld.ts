import * as THREE from "three";
import type { Collider } from "@/game/sim";
import {
  CAMPUS,
  MAP,
  PLACES,
  POD,
  ROAD_X,
  TOWN,
  WATER_Y,
  campusWeight,
  colorAt,
  hash2,
  oldTownWeight,
  podWeight,
  riverHalfWidth,
  riverZ,
  roadWeight,
  sampleHeight,
} from "@/game/world";

export type WorldApi = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  colliders: Collider[];
  applyNight: (t: number) => void;
  setWire: (on: boolean) => void;
  tick: (dt: number, cam: THREE.Vector3, reduced: boolean) => void;
  dispose: () => void;
};

const SEG = 148;

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

export function buildWorld(canvas: HTMLCanvasElement): WorldApi {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const mobile = canvas.clientWidth > 0 && canvas.clientWidth < 800;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc9dcea, 380, 1900);

  const camera = new THREE.PerspectiveCamera(66, 1, 0.35, 4200);

  const hemi = new THREE.HemisphereLight(0xc5dff0, 0x7d8a52, 0.72);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xfff6ea, 0.3);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 520;
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.045;
  scene.add(sun);
  scene.add(sun.target);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1900, 28, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uNight: { value: 0 } },
      vertexShader: `
        varying vec3 vP;
        void main() {
          vP = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vP;
        uniform float uNight;
        void main() {
          float h = normalize(vP).y;
          float t = smoothstep(-0.02, 0.62, h);
          vec3 day = mix(vec3(0.96, 0.86, 0.72), vec3(0.45, 0.70, 0.84), t);
          vec3 night = mix(vec3(0.11, 0.09, 0.14), vec3(0.03, 0.05, 0.11), t);
          vec3 col = mix(day, night, uNight);
          float n = fract(sin(dot(floor(normalize(vP) * 72.0), vec3(12.9898, 78.233, 45.164))) * 43758.5453);
          if (n > 0.986 && h > 0.18) col += uNight * 0.9;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  scene.add(sky);
  const skyMat = sky.material as THREE.ShaderMaterial;

  const disc = new THREE.Mesh(
    new THREE.SphereGeometry(34, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd27a }),
  );
  scene.add(disc);

  const { terrain, wire } = buildTerrain();
  scene.add(terrain);
  scene.add(wire);

  const waterTime = { value: 0 };
  const water = buildWater(waterTime);
  scene.add(water);

  const colliders: Collider[] = [];
  const spin = buildCity(scene, colliders);
  buildTrees(scene);
  const clouds = buildClouds(scene);
  const labels = buildLabels(scene);

  const day = {
    fog: new THREE.Color(0xc9dcea),
    hemiSky: new THREE.Color(0xc5dff0),
    hemiGround: new THREE.Color(0x7d8a52),
    amb: new THREE.Color(0xfff6ea),
    sun: new THREE.Color(0xfff1d6),
    disc: new THREE.Color(0xffd27a),
    wire: new THREE.Color(0x241c16),
  };
  const night = {
    fog: new THREE.Color(0x0c1018),
    hemiSky: new THREE.Color(0x1a2744),
    hemiGround: new THREE.Color(0x1a140e),
    amb: new THREE.Color(0x101624),
    sun: new THREE.Color(0xc5d4ff),
    disc: new THREE.Color(0xe7eeff),
    wire: new THREE.Color(0xc9d4e4),
  };
  const tmp = new THREE.Color();

  const disposables: { dispose: () => void }[] = [];
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) disposables.push(mesh.geometry);
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => disposables.push(m));
    else if (mat) disposables.push(mat);
  });

  function applyNight(t: number) {
    const u = Math.min(1, Math.max(0, t));
    skyMat.uniforms.uNight!.value = u;
    (scene.fog as THREE.Fog).color.copy(tmp.copy(day.fog).lerp(night.fog, u));
    (scene.fog as THREE.Fog).near = THREE.MathUtils.lerp(420, 260, u);
    hemi.color.copy(tmp.copy(day.hemiSky).lerp(night.hemiSky, u));
    hemi.groundColor.copy(tmp.copy(day.hemiGround).lerp(night.hemiGround, u));
    hemi.intensity = THREE.MathUtils.lerp(0.72, 0.38, u);
    ambient.color.copy(tmp.copy(day.amb).lerp(night.amb, u));
    ambient.intensity = THREE.MathUtils.lerp(0.3, 0.34, u);
    sun.color.copy(tmp.copy(day.sun).lerp(night.sun, u));
    sun.intensity = THREE.MathUtils.lerp(1.4, 0.48, u);
    (disc.material as THREE.MeshBasicMaterial).color.copy(tmp.copy(day.disc).lerp(night.disc, u));
    (wire.material as THREE.MeshBasicMaterial).color.copy(tmp.copy(day.wire).lerp(night.wire, u));
    (wire.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.lerp(0.2, 0.32, u);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.05, 0.86, u);
    spin.windows.emissiveIntensity = THREE.MathUtils.lerp(0.08, 2.1, u);
    for (const lamp of spin.lamps) lamp.intensity = THREE.MathUtils.lerp(0, 8, u);
  }

  function setWire(on: boolean) {
    wire.visible = on;
  }

  function tick(dt: number, cam: THREE.Vector3, reduced: boolean) {
    if (!reduced) {
      waterTime.value += dt;
      spin.blades.rotation.z += dt * 0.9;
      for (const c of clouds) {
        const drift = typeof c.userData.drift === "number" ? c.userData.drift : 4;
        c.position.x += dt * drift;
        if (c.position.x > MAP * 0.55) c.position.x = -MAP * 0.55;
      }
    }
    sky.position.copy(cam);
    const u = skyMat.uniforms.uNight!.value as number;
    const az = THREE.MathUtils.lerp(-0.9, 2.5, u);
    const elev = THREE.MathUtils.lerp(0.72, 0.48, u);
    disc.position.set(cam.x + Math.cos(az) * 980, cam.y + elev * 760, cam.z + Math.sin(az) * 980);
    sun.position.set(cam.x + 90, cam.y + 150, cam.z + 50);
    sun.target.position.set(cam.x, 0, cam.z);
    for (const label of labels) {
      const d = cam.distanceTo(label.position);
      const near = THREE.MathUtils.smoothstep(d, 28, 70);
      const far = 1 - THREE.MathUtils.smoothstep(d, 820, 1200);
      (label.material as THREE.SpriteMaterial).opacity = near * far;
    }
  }

  function dispose() {
    renderer.dispose();
    const seen = new Set<{ dispose: () => void }>();
    for (const d of disposables) {
      if (seen.has(d)) continue;
      seen.add(d);
      d.dispose();
    }
  }

  applyNight(0);
  setWire(false);

  return { scene, camera, renderer, colliders, applyNight, setWire, tick, dispose };
}

function buildTerrain(): { terrain: THREE.Mesh; wire: THREE.Mesh } {
  const half = MAP / 2;
  const tri = SEG * SEG * 2;
  const pos = new Float32Array(tri * 9);
  const col = new Float32Array(tri * 9);
  let p = 0;
  const push = (x: number, y: number, z: number, c: { r: number; g: number; b: number }) => {
    pos[p] = x;
    pos[p + 1] = y;
    pos[p + 2] = z;
    col[p] = c.r;
    col[p + 1] = c.g;
    col[p + 2] = c.b;
    p += 3;
  };
  for (let iz = 0; iz < SEG; iz++) {
    for (let ix = 0; ix < SEG; ix++) {
      const x0 = -half + (ix / SEG) * MAP;
      const x1 = -half + ((ix + 1) / SEG) * MAP;
      const z0 = -half + (iz / SEG) * MAP;
      const z1 = -half + ((iz + 1) / SEG) * MAP;
      const y00 = sampleHeight(x0, z0);
      const y10 = sampleHeight(x1, z0);
      const y01 = sampleHeight(x0, z1);
      const y11 = sampleHeight(x1, z1);
      const c1 = colorAt((x0 + x1 + x1) / 3, (z0 + z0 + z1) / 3, (y00 + y10 + y11) / 3);
      const c2 = colorAt((x0 + x1 + x0) / 3, (z0 + z1 + z1) / 3, (y00 + y11 + y01) / 3);
      push(x0, y00, z0, c1);
      push(x1, y10, z0, c1);
      push(x1, y11, z1, c1);
      push(x0, y00, z0, c2);
      push(x1, y11, z1, c2);
      push(x0, y01, z1, c2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  terrain.receiveShadow = true;
  const wire = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color: 0x241c16,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  wire.visible = false;
  return { terrain, wire };
}

function buildWater(uTime: { value: number }): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(MAP * 1.15, MAP * 1.15, 70, 70);
  const mat = new THREE.MeshLambertMaterial({
    color: 0x1a6670,
    transparent: true,
    opacity: 0.9,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float w = sin(position.x * 0.045 + uTime * 1.25) * 0.22
                 + cos(position.y * 0.05 + uTime * 0.85) * 0.16;
         transformed.z += w;`,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = WATER_Y + 0.15;
  mesh.receiveShadow = true;
  return mesh;
}

type CityBits = {
  blades: THREE.Group;
  windows: THREE.MeshStandardMaterial;
  lamps: THREE.PointLight[];
};

function buildCity(scene: THREE.Scene, colliders: Collider[]): CityBits {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cone4 = new THREE.ConeGeometry(0.72, 1, 4);
  const cone = new THREE.ConeGeometry(0.7, 1, 6);
  const cyl = new THREE.CylinderGeometry(0.5, 0.55, 1, 8);

  const brickMat = lambert(0xffffff);
  const roofMat = lambert(0xffffff);
  const windows = new THREE.MeshStandardMaterial({
    color: 0x2a2118,
    emissive: 0xffa14a,
    emissiveIntensity: 0.08,
    roughness: 0.45,
    metalness: 0,
    flatShading: true,
  });
  const brick = lambert(0xb5523a);
  const brickDark = lambert(0x7c3428);
  const roof = lambert(0x343b44);
  const roofTile = lambert(0x5c3a32);
  const stone = lambert(0x8d867c);
  const plaster = lambert(0xf3ead8);
  const wood = lambert(0x6b422c);
  const metal = lambert(0x8d9398);

  const BRICKS = [0x9d4638, 0xb85a42, 0x7e3a30, 0xa34d3c, 0xc46a4e, 0x8a5344, 0xf0e6d4, 0xe7dcc8];
  const ROOFS = [0x3a424c, 0x2a3038, 0x5a3a32, 0x4a4038, 0x32383f];

  const houses: {
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
    ry: number;
    brick: number;
    roof: number;
  }[] = [];

  const blocked = (x: number, z: number, pad: number) => {
    if (roadWeight(x, z) > 0.45) return true;
    if (Math.abs(x - SQUARE_CX) < 34 + pad && Math.abs(z - SQUARE_CZ) < 28 + pad) return true;
    for (const lm of LANDMARK_CLEAR) {
      if (Math.hypot(x - lm.x, z - lm.z) < lm.r + pad) return true;
    }
    return false;
  };

  const tryHouse = (x: number, z: number, scale: number, plasterBias: number) => {
    if (sampleHeight(x, z) < WATER_Y + 2) return;
    if (blocked(x, z, 6)) return;
    const n = hash2(Math.round(x * 3), Math.round(z * 3));
    const n2 = hash2(Math.round(z * 5), Math.round(x * 2));
    const w = (9 + n * 7) * scale;
    const d = (8 + n2 * 6) * scale;
    const h = (7 + n * 9) * (0.75 + scale * 0.35);
    const plasterPick = n2 < plasterBias;
    const brickC = plasterPick ? BRICKS[6 + ((n * 2) | 0) % 2]! : BRICKS[(n * 6) | 0]!;
    houses.push({
      x,
      z,
      w,
      d,
      h,
      ry: n > 0.5 ? 0 : Math.PI / 2,
      brick: brickC,
      roof: ROOFS[(n2 * ROOFS.length) | 0]!,
    });
  };

  for (let ix = -6; ix <= 6; ix++) {
    for (let iz = -2; iz <= 3; iz++) {
      const x = TOWN.cx + ix * 26 + (iz % 2) * 4;
      const z = TOWN.cz + iz * 26;
      if (oldTownWeight(x, z) < 0.72) continue;
      tryHouse(x, z, 1, 0.22);
    }
  }
  for (let ix = -3; ix <= 4; ix++) {
    for (let iz = -1; iz <= 2; iz++) {
      const x = POD.cx + ix * 28;
      const z = POD.cz + iz * 26;
      if (podWeight(x, z) < 0.55) continue;
      tryHouse(x, z, 0.82, 0.45);
    }
  }
  for (let gx = -5; gx <= 6; gx++) {
    for (let gz = -3; gz <= 5; gz++) {
      const x = gx * 200 + 70;
      const z = gz * 180 - 20;
      if (oldTownWeight(x, z) > 0.05 || podWeight(x, z) > 0.2 || campusWeight(x, z) > 0.2) continue;
      if (hash2(gx + 20, gz + 8) > 0.62) continue;
      tryHouse(x, z, 0.7, 0.55);
    }
  }

  const body = new THREE.InstancedMesh(box, brickMat, houses.length);
  const roofs = new THREE.InstancedMesh(cone4, roofMat, houses.length);
  const winMesh = new THREE.InstancedMesh(box, windows, houses.length * 2);
  body.castShadow = true;
  body.receiveShadow = true;
  roofs.castShadow = true;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  houses.forEach((h, i) => {
    const g = sampleHeight(h.x, h.z);
    dummy.position.set(h.x, g + h.h / 2, h.z);
    dummy.scale.set(h.w, h.h, h.d);
    dummy.rotation.set(0, h.ry, 0);
    dummy.updateMatrix();
    body.setMatrixAt(i, dummy.matrix);
    body.setColorAt(i, color.setHex(h.brick));

    const rh = Math.max(h.w, h.d) * 0.42 + 1.6;
    dummy.position.set(h.x, g + h.h + rh / 2 - 0.25, h.z);
    dummy.scale.set(Math.max(h.w, h.d) * 0.78, rh, Math.max(h.w, h.d) * 0.78);
    dummy.rotation.set(0, h.ry + Math.PI / 4, 0);
    dummy.updateMatrix();
    roofs.setMatrixAt(i, dummy.matrix);
    roofs.setColorAt(i, color.setHex(h.roof));

    colliders.push({
      x: h.x,
      z: h.z,
      r: Math.max(h.w, h.d) * 0.46,
      top: g + h.h + rh * 0.85,
    });

    const faceZ = h.d / 2 + 0.12;
    const faceX = h.w / 2 + 0.12;
    const wy = g + h.h * 0.58;
    const c = Math.cos(h.ry);
    const s = Math.sin(h.ry);
    const placeWin = (lx: number, lz: number, sx: number, sz: number, slot: number) => {
      const wx = h.x + lx * c + lz * s;
      const wz = h.z - lx * s + lz * c;
      dummy.position.set(wx, wy, wz);
      dummy.scale.set(sx, Math.min(2.2, h.h * 0.28), sz);
      dummy.rotation.set(0, h.ry, 0);
      dummy.updateMatrix();
      winMesh.setMatrixAt(slot, dummy.matrix);
    };
    placeWin(0, faceZ, h.w * 0.45, 0.18, i * 2);
    placeWin(faceX, 0, 0.18, h.d * 0.4, i * 2 + 1);
  });
  body.instanceMatrix.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  winMesh.instanceMatrix.needsUpdate = true;
  if (body.instanceColor) body.instanceColor.needsUpdate = true;
  if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
  scene.add(body, roofs, winMesh);

  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    ry = 0,
    rz = 0,
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.y = ry;
    m.rotation.z = rz;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  const ground = (x: number, z: number) => sampleHeight(x, z);

  // Ratusz — market square
  {
    const x = -8;
    const z = 58;
    const g = ground(x, z);
    add(box, brick, x, g + 7, z, 22, 14, 18);
    add(box, brickDark, x, g + 22, z, 8.5, 22, 8.5);
    add(cone, roof, x, g + 36, z, 7, 12, 7);
    add(box, stone, x + 4.4, g + 20, z, 0.4, 2.2, 2.2);
    add(box, stone, x - 4.4, g + 20, z, 0.4, 2.2, 2.2);
    add(box, stone, x, g + 20, z + 4.4, 2.2, 2.2, 0.4);
    add(box, stone, x, g + 20, z - 4.4, 2.2, 2.2, 0.4);
    colliders.push({ x, z, r: 12, top: g + 40 });
  }

  // Cathedral of St Johns — east
  {
    const x = 92;
    const z = 96;
    const g = ground(x, z);
    add(box, brickDark, x, g + 9, z, 16, 18, 46);
    add(box, roof, x, g + 19.2, z, 17, 2.2, 48);
    add(box, brick, x - 6, g + 22, z - 16, 9, 28, 9);
    add(cone, roofTile, x - 6, g + 42, z - 16, 6.5, 16, 6.5);
    add(box, brick, x + 6, g + 6, z + 20, 8, 10, 8);
    colliders.push({ x, z, r: 16, top: g + 52 });
  }

  // Leaning tower — south wall, the lean is the whole shaft
  {
    const x = -52;
    const z = 112;
    const g = ground(x, z);
    const group = new THREE.Group();
    group.position.set(x, g, z);
    group.rotation.z = 0.11;
    const shaft = new THREE.Mesh(cyl, brick);
    shaft.position.y = 9;
    shaft.scale.set(7.2, 18, 7.2);
    shaft.castShadow = true;
    const cap = new THREE.Mesh(cone, roofTile);
    cap.position.y = 20;
    cap.scale.set(6.4, 7, 6.4);
    cap.castShadow = true;
    group.add(shaft, cap);
    scene.add(group);
    colliders.push({ x, z, r: 5.5, top: g + 24 });
  }

  // Teutonic castle — southwest, ruined
  {
    const x = -186;
    const z = 138;
    const g = ground(x, z);
    add(box, stone, x - 10, g + 6, z, 4, 12, 22);
    add(box, stone, x + 12, g + 4, z + 6, 16, 8, 3.2);
    add(box, stone, x + 4, g + 3.5, z - 10, 18, 7, 3);
    add(cyl, brickDark, x - 16, g + 8, z + 8, 10, 16, 10);
    add(cone, roof, x - 16, g + 18, z + 8, 7, 6, 7);
    colliders.push({ x, z, r: 18, top: g + 22 });
  }

  // Brama Mostowa
  {
    const x = ROAD_X;
    const z = 116;
    const g = ground(x, z);
    add(box, brick, x - 8, g + 7, z, 4, 14, 6);
    add(box, brick, x + 8, g + 7, z, 4, 14, 6);
    add(box, brickDark, x, g + 12, z, 12, 3, 5);
    add(cone, roof, x - 8, g + 16, z, 3.6, 5, 3.6);
    add(cone, roof, x + 8, g + 16, z, 3.6, 5, 3.6);
    colliders.push({ x: x - 8, z, r: 3.2, top: g + 18 });
    colliders.push({ x: x + 8, z, r: 3.2, top: g + 18 });
  }

  // City wall
  {
    const x0 = TOWN.cx - TOWN.halfX;
    const x1 = TOWN.cx + TOWN.halfX;
    const z0 = TOWN.cz - TOWN.halfZ;
    const z1 = TOWN.cz + TOWN.halfZ;
    const seg = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      if (Math.abs(mx - ROAD_X) < 14 && mz > TOWN.cz) return;
      const g = ground(mx, mz);
      const ry = Math.atan2(bx - ax, bz - az);
      add(box, brickDark, mx, g + 3.4, mz, 2.4, 6.8, len, ry);
    };
    const step = 28;
    for (let x = x0; x < x1; x += step) seg(x, z0, Math.min(x + step, x1), z0);
    for (let x = x0; x < x1; x += step) seg(x, z1, Math.min(x + step, x1), z1);
    for (let z = z0; z < z1; z += step) seg(x0, z, x0, Math.min(z + step, z1));
    for (let z = z0; z < z1; z += step) seg(x1, z, x1, Math.min(z + step, z1));
  }

  // Bridge across the Vistula
  {
    const x = ROAD_X;
    const zA = 128;
    const zB = riverZ(x) + riverHalfWidth(x) + 36;
    const deckY = 23.2;
    const len = zB - zA;
    add(box, stone, x, deckY, (zA + zB) / 2, 9, 1.1, len, 0, 0);
    add(box, metal, x - 4.2, deckY + 1.1, (zA + zB) / 2, 0.35, 1.1, len);
    add(box, metal, x + 4.2, deckY + 1.1, (zA + zB) / 2, 0.35, 1.1, len);
    for (let z = zA + 18; z < zB - 8; z += 34) {
      const bed = Math.min(sampleHeight(x, z), WATER_Y);
      add(box, stone, x, (bed + deckY) / 2, z, 3.2, deckY - bed, 3.2);
    }
    colliders.push({ x, z: (zA + zB) / 2, r: 5.2, top: deckY + 1.2 });
  }

  // UMK — pale blocks on the north terrace
  {
    const spots = [
      { x: 50, z: -250, w: 28, d: 16, h: 14 },
      { x: 92, z: -236, w: 18, d: 22, h: 18 },
      { x: 70, z: -274, w: 36, d: 14, h: 10 },
    ];
    for (const b of spots) {
      const g = ground(b.x, b.z);
      add(box, plaster, b.x, g + b.h / 2, b.z, b.w, b.h, b.d);
      add(box, roof, b.x, g + b.h + 0.6, b.z, b.w + 1, 1.2, b.d + 1);
      colliders.push({ x: b.x, z: b.z, r: Math.max(b.w, b.d) * 0.48, top: g + b.h + 2 });
    }
  }

  // Boats
  for (const bx of [-90, 130]) {
    const bz = riverZ(bx) + 6;
    add(box, wood, bx, WATER_Y + 1.3, bz, 16, 1.4, 4.2);
    add(box, plaster, bx - 2, WATER_Y + 2.6, bz, 5, 1.8, 3);
    add(cone, roofTile, bx + 4, WATER_Y + 3.4, bz, 1.2, 3.5, 1.2);
  }

  // Windmill on the south fields
  const blades = new THREE.Group();
  {
    const x = -340;
    const z = 620;
    const g = ground(x, z);
    add(cyl, plaster, x, g + 8, z, 7, 16, 7);
    add(cone, roof, x, g + 18, z, 6, 5, 6);
    blades.position.set(x, g + 14, z + 3.6);
    const bladeGeo = box;
    for (let i = 0; i < 4; i++) {
      const bld = new THREE.Mesh(bladeGeo, wood);
      bld.scale.set(1.1, 9, 0.35);
      bld.position.y = 4.6;
      const pivot = new THREE.Group();
      pivot.rotation.z = (i * Math.PI) / 2;
      pivot.add(bld);
      blades.add(pivot);
    }
    scene.add(blades);
    colliders.push({ x, z, r: 4, top: g + 20 });
  }

  const lamps = [
    new THREE.PointLight(0xffb15e, 0, 48, 2),
    new THREE.PointLight(0xffb15e, 0, 36, 2),
    new THREE.PointLight(0x9eb6ff, 0, 30, 2),
  ];
  lamps[0]!.position.set(-8, 32, 58);
  lamps[1]!.position.set(92, 28, 96);
  lamps[2]!.position.set(ROAD_X, 30, 200);
  lamps.forEach((l) => scene.add(l));

  return { blades, windows, lamps };
}

const SQUARE_CX = -8;
const SQUARE_CZ = 58;
const LANDMARK_CLEAR = [
  { x: -8, z: 58, r: 16 },
  { x: 92, z: 96, r: 22 },
  { x: -52, z: 112, r: 10 },
  { x: -186, z: 138, r: 22 },
  { x: ROAD_X, z: 116, r: 14 },
];

function buildTrees(scene: THREE.Scene) {
  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.6, 1, 5);
  const crownGeo = new THREE.ConeGeometry(1, 1.3, 5);
  const trunkMat = lambert(0xffffff);
  const crownMat = lambert(0xffffff);
  const max = 460;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, max);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, max);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const GREENS = [0x3f6b3a, 0x2f5530, 0x4e7a3e, 0x6a8f3a, 0x8a6230];
  let n = 0;
  for (let i = 0; i < 1100 && n < max; i++) {
    const x = (hash2(i, 11) - 0.5) * (MAP - 180);
    const z = (hash2(i, 29) - 0.5) * (MAP - 180);
    const h = sampleHeight(x, z);
    if (h < WATER_Y + 1.3) continue;
    if (oldTownWeight(x, z) > 0.28) continue;
    if (roadWeight(x, z) > 0.35) continue;
    if (campusWeight(x, z) > 0.45) continue;
    const north = z < -60;
    const keep = hash2(i, 5);
    if (!north && keep > 0.42) continue;
    if (north && keep > 0.9) continue;
    if (podWeight(x, z) > 0.5 && keep > 0.35) continue;
    const s = 0.75 + hash2(i, 8) * 1.5;
    const th = 1.6 * s;
    dummy.position.set(x, h + th / 2, z);
    dummy.scale.set(s, th, s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(n, dummy.matrix);
    trunks.setColorAt(n, color.setHex(0x6a4a32));
    const ch = 3.2 * s;
    dummy.position.set(x, h + th + ch * 0.35, z);
    dummy.scale.set(1.7 * s, ch, 1.7 * s);
    dummy.rotation.y = keep * 3;
    dummy.updateMatrix();
    crowns.setMatrixAt(n, dummy.matrix);
    crowns.setColorAt(n, color.setHex(GREENS[(keep * GREENS.length) | 0]!));
    n++;
  }
  trunks.count = n;
  crowns.count = n;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  scene.add(trunks, crowns);
}

function buildClouds(scene: THREE.Scene): THREE.Object3D[] {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = lambert(0xf7f4ee);
  const clouds: THREE.Object3D[] = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const blobs = 3 + ((hash2(i, 2) * 3) | 0);
    for (let b = 0; b < blobs; b++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set((b - 1) * 10, hash2(i, b + 3) * 4, hash2(b, i) * 6);
      const s = 8 + hash2(i + 4, b) * 10;
      m.scale.set(s, s * 0.62, s);
      g.add(m);
    }
    g.position.set((hash2(i, 70) - 0.5) * MAP * 0.8, 250 + hash2(i, 90) * 90, (hash2(i, 15) - 0.5) * MAP * 0.7);
    g.userData.drift = 3 + hash2(i, 4) * 5;
    scene.add(g);
    clouds.push(g);
  }
  return clouds;
}

function buildLabels(scene: THREE.Scene): THREE.Sprite[] {
  const sprites: THREE.Sprite[] = [];
  for (const place of PLACES) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const g = canvas.getContext("2d");
    if (!g) continue;
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = "rgba(251, 247, 239, 0.94)";
    roundRect(g, 16, 24, 480, 80, 18);
    g.fill();
    g.strokeStyle = "#d9d0c2";
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = "#1c1915";
    g.font = "600 42px Outfit, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(place.name, 256, 66);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    const y = sampleHeight(place.x, place.z);
    sprite.position.set(place.x, Math.max(y, WATER_Y) + 36, place.z);
    sprite.scale.set(52, 13, 1);
    scene.add(sprite);
    sprites.push(sprite);
  }
  return sprites;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
