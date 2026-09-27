// Light-aircraft flight model. +Y up, nose along local -Z.
// Controls: A banks LEFT (and so turns left), D right. ArrowUp = nose up. W/S throttle. Q/E rudder.
import * as THREE from 'three';

const G = 9.81;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export class Flight {
  constructor() {
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.speed = 50;         // m/s airspeed
    this.throttle = 0.6;
    this.rates = new THREE.Vector3(); // pitch, yaw, roll (rad/s, local)
    this.vy = 0;
    this.crashed = 0;
    this.stall = false;
  }
  reset(x, y, z, headingRad, speed = 52) {
    this.pos.set(x, y, z);
    this.quat.setFromAxisAngle(Y, headingRad);
    this.speed = speed; this.throttle = 0.62; this.rates.set(0, 0, 0); this.crashed = 0; this.vy = 0;
  }
  forward(t = _fwd) { return t.set(0, 0, -1).applyQuaternion(this.quat); }
  right(t = _right) { return t.set(1, 0, 0).applyQuaternion(this.quat); }
  up(t = _up) { return t.set(0, 1, 0).applyQuaternion(this.quat); }
  // heading: 0 = north (-Z), clockwise positive, degrees
  heading() { const f = this.forward(new THREE.Vector3()); let h = Math.atan2(f.x, -f.z) * 180 / Math.PI; return (h + 360) % 360; }
  bank() { const r = this.right(new THREE.Vector3()), u = this.up(new THREE.Vector3()); return Math.atan2(r.y, u.y); } // + = left wing down
  pitchAngle() { const f = this.forward(new THREE.Vector3()); return Math.asin(THREE.MathUtils.clamp(f.y, -1, 1)); }

  step(dt, input, floorAt) {
    if (this.crashed > 0) { this.crashed -= dt; return; }
    dt = Math.min(dt, 0.05);
    // throttle
    this.throttle = THREE.MathUtils.clamp(this.throttle + input.throttle * 0.5 * dt, 0, 1);
    const pitchA = this.pitchAngle();
    // speed: thrust - drag - gravity along path
    const thrust = 0.6 + this.throttle * 3.4;          // m/s^2 at full throttle
    const drag = 0.00082 * this.speed * this.speed + 0.012 * this.speed;
    this.speed += (thrust - drag - G * Math.sin(pitchA)) * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, 12, 95);
    this.stall = this.speed < 24;

    // control rates (smoothed)
    const eff = THREE.MathUtils.clamp(this.speed / 45, 0.35, 1.25);
    const target = new THREE.Vector3(
      input.pitch * 0.85 * eff,
      input.yaw * 0.32 * eff,
      input.roll * 1.55 * eff,
    );
    // stability: roll back to level when stick released, damp pitch
    const bank = this.bank();
    if (Math.abs(input.roll) < 0.05) target.z += -bank * 0.9;
    // bank limit (~62°): keeps it a pleasant sightseeing aircraft
    const maxB = 1.08;
    if (bank > maxB) target.z = Math.min(target.z, (maxB - bank) * 4);
    if (bank < -maxB) target.z = Math.max(target.z, (-maxB - bank) * 4);
    if (Math.abs(input.pitch) < 0.05) target.x += -pitchA * 0.25;
    // stall: nose drops
    if (this.stall) target.x -= (24 - this.speed) * 0.05;
    const k = 1 - Math.exp(-dt / 0.22);
    this.rates.lerp(target, k);

    // apply local rotations
    _q.setFromAxisAngle(X, this.rates.x * dt); this.quat.multiply(_q);
    _q.setFromAxisAngle(Y, this.rates.y * dt); this.quat.multiply(_q);
    _q.setFromAxisAngle(Z, this.rates.z * dt); this.quat.multiply(_q);
    // coordinated turn around world up
    const turn = G * Math.tan(THREE.MathUtils.clamp(bank, -1.15, 1.15)) / Math.max(this.speed, 15);
    _q.setFromAxisAngle(Y, turn * dt);
    this.quat.premultiply(_q);
    // banking costs lift: nose slides down slightly
    const liftLoss = (1 - Math.cos(bank)) * 0.35;
    _q.setFromAxisAngle(X, -liftLoss * dt); this.quat.multiply(_q);
    this.quat.normalize();

    // move
    this.forward(_v);
    const sink = this.stall ? (24 - this.speed) * 0.6 : 0;
    this.pos.addScaledVector(_v, this.speed * dt);
    this.pos.y -= sink * dt;
    this.vy = _v.y * this.speed - sink;

    // collision
    const floor = floorAt(this.pos.x, this.pos.z);
    if (this.pos.y < floor + 1.2) {
      this.crashed = 2.2;
      return 'crash';
    }
    // ceiling
    if (this.pos.y > 4500) this.pos.y = 4500;
    return null;
  }
}

// Autopilot: fly a waypoint tour over the landmarks.
export class Autopilot {
  constructor(route) { this.route = route; this.i = 0; this.active = false; }
  start(flight) {
    // begin at the nearest waypoint ahead
    let best = 0, bd = Infinity;
    this.route.forEach((w, i) => { const d = Math.hypot(w.x - flight.pos.x, w.z - flight.pos.z); if (d < bd) { bd = d; best = i; } });
    this.i = best; this.active = true;
  }
  stop() { this.active = false; }
  current() { return this.route[this.i]; }
  control(flight, groundAt) {
    const w = this.route[this.i];
    const dx = w.x - flight.pos.x, dz = w.z - flight.pos.z, d = Math.hypot(dx, dz);
    if (this.bestD === undefined || this.lastI !== this.i) { this.bestD = d; this.lastI = this.i; }
    this.bestD = Math.min(this.bestD, d);
    // reached, or overshot and flying away (turn radius too big) -> next waypoint
    if (d < 180 || d > this.bestD + 350) this.i = (this.i + 1) % this.route.length;
    const want = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
    let err = want - flight.heading(); if (err > 180) err -= 360; if (err < -180) err += 360;
    // desired bank: left turn = positive bank (A)
    const desiredBank = THREE.MathUtils.clamp(-err * 0.022, -0.55, 0.55);
    const bank = flight.bank();
    const roll = THREE.MathUtils.clamp((desiredBank - bank) * 2.2, -1, 1);
    const g = Math.max(groundAt(flight.pos.x, flight.pos.z), groundAt(flight.pos.x + flight.forward().x * 400, flight.pos.z + flight.forward().z * 400));
    const alt = Math.max(w.alt, g + 140);
    const desiredPitch = THREE.MathUtils.clamp((alt - flight.pos.y) * 0.004, -0.12, 0.16);
    const pitch = THREE.MathUtils.clamp((desiredPitch - flight.pitchAngle()) * 3.0, -1, 1);
    const spd = w.speed || 46;
    const throttle = THREE.MathUtils.clamp((spd - flight.speed) * 0.25, -1, 1);
    return { roll, pitch, yaw: 0, throttle };
  }
}
