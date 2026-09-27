/**
 * Free-flight (FPS / drone), not fixed-wing steer.
 * Mouse owns look. Keyboard propulsion is in the view frame:
 *   W/S forward/back along look, A strafe left, D strafe right,
 *   Space/E up, Shift/Q down.
 * Basis (yaw 0 faces −Z, +yaw CCW): forward = (−sin yaw, sin pitch, −cos yaw),
 * right = (cos yaw, 0, −sin yaw). A → strafe −1 → −right.
 */

export const CLEARANCE = 2.6;
export const MAX_SPEED = 52;
const RESPONSE = 3.15;

export type FlightState = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
};

export type FlightActions = {
  forward: number;
  strafe: number;
  lift: number;
  lookX: number;
  lookY: number;
};

export type Collider = { x: number; z: number; r: number; top: number };

export type PadSnap = {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  up: number;
  down: number;
} | null;

export function radialDeadzone(x: number, y: number, dz = 0.16): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < dz || m === 0) return { x: 0, y: 0 };
  const s = (m - dz) / (1 - dz) / m;
  return { x: x * s, y: y * s };
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function speedOf(s: FlightState): number {
  return Math.hypot(s.vx, s.vy, s.vz);
}

export function lookToward(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horiz = Math.hypot(dx, dz) || 1;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, horiz) };
}

export function readActions(
  held: Set<string>,
  lookX: number,
  lookY: number,
  stickX: number,
  stickY: number,
  pad: PadSnap,
  dt: number,
): FlightActions {
  let forward = 0;
  let strafe = 0;
  let lift = 0;
  if (held.has("KeyW") || held.has("ArrowUp")) forward += 1;
  if (held.has("KeyS") || held.has("ArrowDown")) forward -= 1;
  if (held.has("KeyA") || held.has("ArrowLeft")) strafe -= 1;
  if (held.has("KeyD") || held.has("ArrowRight")) strafe += 1;
  if (held.has("Space") || held.has("KeyE")) lift += 1;
  if (
    held.has("ShiftLeft") ||
    held.has("ShiftRight") ||
    held.has("ControlLeft") ||
    held.has("ControlRight") ||
    held.has("KeyQ") ||
    held.has("KeyC")
  ) {
    lift -= 1;
  }
  if (pad) {
    forward += -pad.ly;
    strafe += pad.lx;
    lift += pad.up - pad.down;
    lookX += pad.rx * 1.45 * dt;
    lookY += pad.ry * 1.15 * dt;
  }
  return {
    forward: clamp(forward + stickY, -1, 1),
    strafe: clamp(strafe + stickX, -1, 1),
    lift: clamp(lift, -1, 1),
    lookX,
    lookY,
  };
}

export function stepFlight(
  s: FlightState,
  a: FlightActions,
  dtIn: number,
  surfaceAt: (x: number, z: number) => number,
  colliders: Collider[],
  limit: number,
): boolean {
  const dt = Math.min(Math.max(dtIn, 0), 0.05);
  s.yaw -= a.lookX;
  s.pitch = clamp(s.pitch - a.lookY, -1.15, 1.15);

  const cp = Math.cos(s.pitch);
  const sp = Math.sin(s.pitch);
  const sy = Math.sin(s.yaw);
  const cy = Math.cos(s.yaw);
  const fx = -sy * cp;
  const fy = sp;
  const fz = -cy * cp;
  const rx = cy;
  const rz = -sy;

  let wx = fx * a.forward + rx * a.strafe;
  let wy = fy * a.forward + a.lift;
  let wz = fz * a.forward + rz * a.strafe;
  const wm = Math.hypot(wx, wy, wz);
  if (wm > 1) {
    wx /= wm;
    wy /= wm;
    wz /= wm;
  }

  const k = 1 - Math.exp(-RESPONSE * dt);
  s.vx += (wx * MAX_SPEED - s.vx) * k;
  s.vy += (wy * MAX_SPEED - s.vy) * k;
  s.vz += (wz * MAX_SPEED - s.vz) * k;

  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;

  const lim = limit;
  if (s.x < -lim) {
    s.x = -lim;
    if (s.vx < 0) s.vx = 0;
  } else if (s.x > lim) {
    s.x = lim;
    if (s.vx > 0) s.vx = 0;
  }
  if (s.z < -lim) {
    s.z = -lim;
    if (s.vz < 0) s.vz = 0;
  } else if (s.z > lim) {
    s.z = lim;
    if (s.vz > 0) s.vz = 0;
  }
  if (s.y > 460) {
    s.y = 460;
    if (s.vy > 0) s.vy = 0;
  }

  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const dx = s.x - c.x;
      const dz = s.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d >= c.r || d < 1e-4) continue;
      if (s.y >= c.top - 1.5 && s.y <= c.top + CLEARANCE + 3) {
        if (s.y < c.top + CLEARANCE) {
          s.y = c.top + CLEARANCE;
          if (s.vy < 0) s.vy = 0;
        }
      } else if (s.y < c.top) {
        const nx = dx / d;
        const nz = dz / d;
        const push = c.r - d;
        s.x += nx * push;
        s.z += nz * push;
        const vn = s.vx * nx + s.vz * nz;
        if (vn < 0) {
          s.vx -= vn * nx;
          s.vz -= vn * nz;
        }
      }
    }
  }

  const floorY = surfaceAt(s.x, s.z) + CLEARANCE;
  if (s.y < floorY) {
    s.y = floorY;
    if (s.vy < 0) s.vy = 0;
  }
  return s.y <= floorY + 0.08 && s.vy <= 0.2;
}
