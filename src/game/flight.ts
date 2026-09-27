/** Light-aircraft step. +Y up, yaw 0 faces world −Z (north). +roll = left wing down = +yaw. */

export type FlightState = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  throttle: number;
};

export type FlightActions = {
  /** +1 more throttle, −1 less. */
  throttle: number;
  /** +1 bank left (A), −1 bank right (D). */
  roll: number;
  /** +1 nose up, −1 nose down. */
  pitch: number;
};

const MAX_ROLL = 1.05;
const MAX_PITCH = 0.55;
const ROLL_RATE = 2.15;
const PITCH_RATE = 0.85;
const THROTTLE_RATE = 0.45;

export function createFlight(start: { x: number; z: number; y: number }): FlightState {
  return {
    x: start.x,
    y: start.y,
    z: start.z,
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 42,
    throttle: 0.55,
  };
}

export function stepFlight(
  s: FlightState,
  a: FlightActions,
  dt: number,
  groundY: (x: number, z: number) => number,
): FlightState {
  const h = Math.min(0.05, Math.max(0, dt));

  s.throttle = clamp(s.throttle + a.throttle * THROTTLE_RATE * h, 0, 1);
  const target = 28 + s.throttle * 30;
  s.speed += (target - s.speed) * (1 - Math.exp(-1.6 * h));

  s.roll += a.roll * ROLL_RATE * h;
  if (Math.abs(a.roll) < 0.08) s.roll *= Math.exp(-1.15 * h);
  s.roll = clamp(s.roll, -MAX_ROLL, MAX_ROLL);

  s.pitch += a.pitch * PITCH_RATE * h;
  if (Math.abs(a.pitch) < 0.08) s.pitch *= Math.exp(-0.9 * h);
  s.pitch = clamp(s.pitch, -0.5, MAX_PITCH);

  if (s.speed < 26) s.pitch = Math.min(s.pitch, -0.12);

  s.yaw += Math.sin(s.roll) * (0.55 + s.speed * 0.018) * h;

  const cp = Math.cos(s.pitch);
  const sp = Math.sin(s.pitch);
  const fx = -Math.sin(s.yaw) * cp;
  const fy = sp;
  const fz = -Math.cos(s.yaw) * cp;
  s.x += fx * s.speed * h;
  s.y += fy * s.speed * h;
  s.z += fz * s.speed * h;

  const floor = groundY(s.x, s.z);
  if (s.y < floor) {
    s.y = floor;
    if (s.pitch < 0.02) s.pitch = 0.02;
  }
  return s;
}

export function headingDeg(yaw: number): number {
  const deg = ((-yaw * 180) / Math.PI) % 360;
  return deg < 0 ? deg + 360 : deg;
}

export function compass(yaw: number): string {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const deg = headingDeg(yaw);
  return names[Math.round(deg / 45) % 8] ?? "N";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
