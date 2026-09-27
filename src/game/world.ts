/** Stylized Toruń heightfield. Units are model metres, not a survey. */

export const MAP = 2600;
export const WATER_Y = 6.2;

export const TOWN = { cx: -8, cz: 58, halfX: 148, halfZ: 62 };
export const ROAD_X = 24;
export const SQUARE = { cx: -8, cz: 58, halfX: 30, halfZ: 24 };
export const POD = { cx: 40, cz: 560, halfX: 110, halfZ: 58 };
export const CAMPUS = { cx: 80, cz: -250, halfX: 78, halfZ: 48 };

export type RGB = { r: number; g: number; b: number };

export type Place = { name: string; x: number; z: number };

export function riverZ(x: number): number {
  return 330 + Math.sin(x * 0.0028) * 40 + Math.sin(x * 0.0065 + 0.5) * 16;
}

export function riverHalfWidth(x: number): number {
  return 72 + Math.sin(x * 0.0022 + 1.1) * 16;
}

export const PLACES: Place[] = [
  { name: "Rynek i Ratusz", x: -8, z: 58 },
  { name: "Katedra św. Janów", x: 92, z: 96 },
  { name: "Krzywa Wieża", x: -52, z: 112 },
  { name: "Zamek krzyżacki", x: -186, z: 138 },
  { name: "Brama Mostowa", x: ROAD_X, z: 116 },
  { name: "Most przez Wisłę", x: ROAD_X, z: 250 },
  { name: "Wisła", x: 0, z: riverZ(0) },
  { name: "Kępa Bazarowa", x: 18, z: riverZ(18) - riverHalfWidth(18) * 0.42 },
  { name: "Podgórz", x: POD.cx, z: POD.cz },
  { name: "Bielany · UMK", x: CAMPUS.cx, z: CAMPUS.cz },
];

function smoother(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0 || 1)));
  return t * t * (3 - 2 * t);
}

export function hash2(ix: number, iz: number): number {
  let n = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const v00 = hash2(x0, z0);
  const v10 = hash2(x0 + 1, z0);
  const v01 = hash2(x0, z0 + 1);
  const v11 = hash2(x0 + 1, z0 + 1);
  return v00 + (v10 - v00) * sx + (v01 - v00) * sz + (v00 - v10 - v01 + v11) * sx * sz;
}

function fbm(x: number, z: number): number {
  let a = 0;
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    a += valueNoise(x * f, z * f) * amp;
    sum += amp;
    amp *= 0.5;
    f *= 2.07;
  }
  return a / sum;
}

function rectWeight(
  x: number,
  z: number,
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number,
  fall: number,
): number {
  const dx = Math.max(Math.abs(x - cx) - halfX, 0);
  const dz = Math.max(Math.abs(z - cz) - halfZ, 0);
  return 1 - smoother(0, fall, Math.hypot(dx, dz));
}

export function oldTownWeight(x: number, z: number): number {
  return rectWeight(x, z, TOWN.cx, TOWN.cz, TOWN.halfX, TOWN.halfZ, 22);
}

export function podWeight(x: number, z: number): number {
  return rectWeight(x, z, POD.cx, POD.cz, POD.halfX, POD.halfZ, 20);
}

export function campusWeight(x: number, z: number): number {
  return rectWeight(x, z, CAMPUS.cx, CAMPUS.cz, CAMPUS.halfX, CAMPUS.halfZ, 24);
}

export function roadWeight(x: number, z: number): number {
  const dNS = Math.abs(x - ROAD_X);
  const onEW = Math.abs(x - TOWN.cx) < TOWN.halfX + 30;
  const dEW = onEW ? Math.abs(z - SQUARE.cz) : 999;
  return 1 - smoother(4.5, 10, Math.min(dNS, dEW));
}

function squareWeight(x: number, z: number): number {
  const dx = Math.max(Math.abs(x - SQUARE.cx) - SQUARE.halfX, 0);
  const dz = Math.max(Math.abs(z - SQUARE.cz) - SQUARE.halfZ, 0);
  return 1 - smoother(0, 8, Math.hypot(dx, dz));
}

export function sampleHeight(x: number, z: number): number {
  const rz = riverZ(x);
  const width = riverHalfWidth(x);
  const ad = Math.abs(z - rz);

  let h = 17 + (fbm(x * 0.0034, z * 0.0034) - 0.42) * 22;
  h += (fbm(x * 0.011, z * 0.011) - 0.5) * 5.5;

  const hill = Math.max(0, -z - 360) / 640;
  h += hill * hill * 34 * (0.45 + fbm(x * 0.0025, z * 0.0025));

  if (ad < width) {
    const u = ad / width;
    h = Math.min(h, 1.15 + u * u * 4.4);
  } else {
    const bankT = Math.min(1, (ad - width) / 110);
    const lift = (1 - (1 - bankT) * (1 - bankT)) * 9;
    h += lift;
    if (bankT < 1) h = Math.min(h, 12 + bankT * 14);
  }

  if (x > -50 && x < 110) {
    const iz = rz - width * 0.42;
    const id = Math.hypot((x - 18) / 46, (z - iz) / 11);
    if (id < 1) h = Math.max(h, WATER_Y + 1.7 * (1 - id));
  }

  const town = oldTownWeight(x, z);
  if (town > 0) h = h * (1 - town) + 21.4 * town;

  const pod = podWeight(x, z);
  if (pod > 0) h = h * (1 - pod) + 18.2 * pod;

  const campus = campusWeight(x, z);
  if (campus > 0) h = h * (1 - campus) + 27.5 * campus;

  return h;
}

/** Visible surface: river plane where the bed is submerged. */
export function sampleSurface(x: number, z: number): number {
  return Math.max(sampleHeight(x, z), WATER_Y);
}

function hex(n: number): RGB {
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

const BANDS: { h: number; c: RGB }[] = [
  { h: 4, c: hex(0x143e44) },
  { h: 8.2, c: hex(0xe4c89a) },
  { h: 14, c: hex(0xb7c47a) },
  { h: 22, c: hex(0x6e8f45) },
  { h: 32, c: hex(0xc6a15a) },
  { h: 46, c: hex(0x8a7048) },
  { h: 72, c: hex(0x6d6258) },
];

const COBBLE = hex(0xb7a48c);
const SQUARE_C = hex(0xd2c2a4);
const ROAD = hex(0x5a5148);
const FIELD = hex(0xd2ae62);

export function colorAt(x: number, z: number, h: number): RGB {
  let c = BANDS[BANDS.length - 1]!.c;
  if (h <= BANDS[0]!.h) c = BANDS[0]!.c;
  else {
    for (let i = 1; i < BANDS.length; i++) {
      const b = BANDS[i]!;
      if (h <= b.h) {
        const a = BANDS[i - 1]!;
        c = mix(a.c, b.c, (h - a.h) / (b.h - a.h));
        break;
      }
    }
  }
  const town = oldTownWeight(x, z);
  if (town > 0.12) c = mix(c, COBBLE, Math.min(1, town) * 0.82);
  const sq = squareWeight(x, z);
  if (sq > 0) c = mix(c, SQUARE_C, sq);
  const road = roadWeight(x, z);
  if (road > 0 && h > WATER_Y + 0.4) c = mix(c, ROAD, road * 0.92);
  if (town < 0.2 && h > 13 && h < 31 && road < 0.25) {
    const stripe = Math.sin(x * 0.055 + z * 0.012) > 0.2 ? 0.38 : 0;
    if (stripe) c = mix(c, FIELD, stripe);
  }
  return c;
}

export function nearestPlace(x: number, z: number): { place: Place; dist: number } {
  let best = PLACES[0]!;
  let bestD = Infinity;
  for (const p of PLACES) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return { place: best, dist: bestD };
}

const HEADINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** yaw 0 looks north (−Z). Heading degrees clockwise from north. */
export function headingFromYaw(yaw: number): { deg: number; label: string } {
  const deg = ((-yaw * 180) / Math.PI + 360) % 360;
  const label = HEADINGS[Math.round(deg / 45) % 8]!;
  return { deg, label };
}
