import type * as THREE from "three";

const W = 5887.92;

export type CityHandle = {
  materials: THREE.Material[];
  /** Building height in real metres. 0 = none. */
  roofAt: (x: number, z: number) => number;
  buildings: number;
};

function coloredMesh(
  THREE: typeof import("three"),
  bin: ArrayBuffer,
  offset: number,
  count: number,
): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; next: number } {
  const floats = new Float32Array(bin, offset, count * 6);
  const geo = new THREE.BufferGeometry();
  const packed = new THREE.InterleavedBuffer(floats, 6);
  geo.setAttribute("position", new THREE.InterleavedBufferAttribute(packed, 3, 0));
  geo.setAttribute("color", new THREE.InterleavedBufferAttribute(packed, 3, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  return { mesh: new THREE.Mesh(geo, mat), mat, next: offset + count * 6 * 4 };
}

export function mountCity(
  THREE: typeof import("three"),
  scene: THREE.Scene,
  bin: ArrayBuffer,
  groundMap: THREE.Texture,
): CityHandle {
  void groundMap;
  const view = new DataView(bin);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== "TOR3") throw new Error("Zły plik miasta");
  let o = 4;
  const roofVerts = view.getUint32(o, true);
  o += 4;
  const roof = coloredMesh(THREE, bin, o, roofVerts);
  o = roof.next;
  roof.mesh.position.y = 0.35;
  scene.add(roof.mesh);

  const wallVerts = view.getUint32(o, true);
  o += 4;
  const wall = coloredMesh(THREE, bin, o, wallVerts);
  o = wall.next;
  scene.add(wall.mesh);

  const grid = view.getUint32(o, true);
  o += 4;
  const roofMax = view.getFloat32(o, true);
  o += 4;
  const cells = new Uint8Array(bin, o, grid * grid);
  const roofAt = (x: number, z: number) => {
    const u = Math.min(1, Math.max(0, (x + W / 2) / W));
    const v = Math.min(1, Math.max(0, (z + W / 2) / W));
    const i = Math.round(u * (grid - 1));
    const j = Math.round(v * (grid - 1));
    return (cells[j * grid + i] / 255) * roofMax;
  };

  return { materials: [roof.mat, wall.mat], roofAt, buildings: 11482 };
}

export type Shot = { src: string; x: number; z: number; w: number; h: number; name: string };

export function mountShots(
  THREE: typeof import("three"),
  scene: THREE.Scene,
  shots: Shot[],
  groundY: (x: number, z: number) => number,
  _exag: number,
  loader: THREE.TextureLoader,
): THREE.Material[] {
  const mats: THREE.Material[] = [];
  shots.forEach((s, i) => {
    const tex = loader.load(s.src);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false });
    mats.push(mat);
    const h = Math.min(s.h, 16);
    const w = Math.min(s.w, 18);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(w, h, 1);
    sprite.center.set(0.5, 0);
    const y = groundY(s.x, s.z) + 1.2;
    const nudge = (i % 5) * 0.4;
    sprite.position.set(s.x + nudge, y, s.z + nudge);
    sprite.renderOrder = 2;
    scene.add(sprite);
  });
  return mats;
}
