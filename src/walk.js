// Calm aerial walk: a gently floating viewpoint (no aircraft, no crashing).
// A / D turn left / right, W / S forward / back, Q / E sideways, Space / C up / down,
// mouse drag looks around, wheel changes pace.
import * as THREE from 'three';

export const PACES = [4, 8, 14, 22, 35, 60];   // m/s

export class Walker {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;          // 0 = north (-Z), positive = turned left (counter-clockwise from above)
    this.pitch = -0.18;    // look angle
    this.yawRate = 0;
    this.paceIdx = 2;
    this.minAGL = 30;
    this.crashed = 0; this.stall = false; // HUD compatibility
  }
  get pace() { return PACES[this.paceIdx]; }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get vy() { return this.vel.y; }
  get throttle() { return this.paceIdx / (PACES.length - 1); }
  heading() { return ((-this.yaw * 180 / Math.PI) % 360 + 360) % 360; }
  forward(t = new THREE.Vector3()) { return t.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right(t = new THREE.Vector3()) { return t.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  reset(x, y, z, yaw = 0, pitch = -0.18) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = pitch; this.yawRate = 0;
  }
  setPace(d) { this.paceIdx = THREE.MathUtils.clamp(this.paceIdx + d, 0, PACES.length - 1); }

  step(dt, inp, floorAt) {
    dt = Math.min(dt, 0.05);
    // smooth turning
    const k = 1 - Math.exp(-dt * 4);
    this.yawRate += ((inp.turn || 0) * 0.75 - this.yawRate) * k;
    this.yaw += this.yawRate * dt + (inp.lookYaw || 0);
    this.pitch = THREE.MathUtils.clamp(this.pitch + (inp.look || 0) * 0.7 * dt + (inp.lookPitch || 0), -1.45, 0.7);
    // gliding motion
    const f = this.forward(), r = this.right();
    const target = new THREE.Vector3()
      .addScaledVector(f, (inp.fwd || 0) * this.pace)
      .addScaledVector(r, (inp.strafe || 0) * this.pace);
    target.y = (inp.up || 0) * Math.max(5, this.pace * 0.6);
    this.vel.lerp(target, 1 - Math.exp(-dt * 1.6));
    this.pos.addScaledVector(this.vel, dt);
    // soft floor: never touch roofs or ground, just float up gently
    const floor = floorAt(this.pos.x, this.pos.z) + this.minAGL;
    if (this.pos.y < floor) {
      this.pos.y += (floor - this.pos.y) * (1 - Math.exp(-dt * 2.5));
      if (this.vel.y < 0) this.vel.y *= 0.8;
    }
    if (this.pos.y > 3000) this.pos.y = 3000;
  }
}

// Slow scenic tour: a smooth closed spline through the landmarks.
export class Tour {
  constructor(points, heightAt) {
    this.curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, Math.max(p.alt, heightAt(p.x, p.z) + 90), p.z)), true, 'centripetal', 0.5);
    this.length = this.curve.getLength();
    this.u = 0; this.active = false; this.speed = 13;
    this.route = points;
  }
  start(walker) {
    // join at the closest point of the loop
    let best = 0, bd = Infinity;
    for (let i = 0; i < 400; i++) { const p = this.curve.getPointAt(i / 400); const d = p.distanceTo(walker.pos); if (d < bd) { bd = d; best = i / 400; } }
    this.u = best; this.active = true; this.join = walker.pos.clone(); this.joinT = 0;
  }
  stop() { this.active = false; }
  step(dt, walker) {
    this.u = (this.u + this.speed * dt / this.length) % 1;
    const p = this.curve.getPointAt(this.u);
    const ahead = this.curve.getPointAt((this.u + 60 / this.length) % 1);
    // ease in from wherever the walker was
    this.joinT = Math.min(1, this.joinT + dt / 6);
    const e = this.joinT * this.joinT * (3 - 2 * this.joinT);
    walker.pos.lerpVectors(this.join, p, e);
    const dx = ahead.x - p.x, dz = ahead.z - p.z;
    const wantYaw = Math.atan2(-dx, -dz);
    let d = wantYaw - walker.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    walker.yaw += d * (1 - Math.exp(-dt * 1.2));
    walker.pitch += (-0.3 - walker.pitch) * (1 - Math.exp(-dt * 0.8));
    walker.vel.set(dx, 0, dz).normalize().multiplyScalar(this.speed);
  }
}
