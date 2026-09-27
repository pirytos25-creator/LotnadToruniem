// Sky, sun, moon, fog, image-based lighting and time of day for Toruń (53°N).
import * as THREE from 'three';
import { Sky } from 'extras';
import { makeStarTexture } from './textures.js';
import { shared } from './materials.js';

const LAT = 53.0 * Math.PI / 180;

export function sunDirection(hour, date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const doy = Math.floor((date - start) / 86400000);
  const dec = -23.44 * Math.PI / 180 * Math.cos(2 * Math.PI / 365 * (doy + 10));
  const noon = 12.75; // solar noon in Toruń, summer time
  const H = (hour - noon) * 15 * Math.PI / 180;
  const sinEl = Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H);
  const el = Math.asin(sinEl);
  const az = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(LAT) - Math.cos(dec) * Math.cos(H) * Math.sin(LAT));
  // +X east, +Y up, +Z south; az measured from north towards east
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

export class Atmosphere {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(80000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    u.cloudCoverage.value = 0.32; u.cloudDensity.value = 0.45; u.cloudElevation.value = 0.55; u.cloudScale.value = 0.00022;
    // night: deep blue gradient with a faint city glow near the horizon
    u.nightTint = { value: new THREE.Vector3(0, 0, 0) };
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace('uniform float time;', 'uniform float time;\nuniform vec3 nightTint;')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', `
        float hz = 1.0 - max(direction.y, 0.0);
        texColor += nightTint * (0.35 + 0.65 * pow(hz, 3.0)) + vec3(0.012, 0.006, 0.002) * pow(hz, 12.0) * step(0.001, nightTint.b);
        gl_FragColor = vec4( texColor, 1.0 );`);
    this.sky.material.needsUpdate = true;

    // env map sky (no sun disc to avoid fireflies)
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(50);
    this.envSky.material.uniforms.showSunDisc.value = 0;
    this.envSky.material.uniforms.cloudCoverage.value = 0.0;
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.position.set(0, 1000, 0);
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a4535, 0.5);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xb8c8d8, 0.00006);

    // stars
    const N = 2500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u1 = Math.random(), v1 = Math.random();
      const th = 2 * Math.PI * u1, ph = Math.acos(2 * v1 - 1);
      const x = Math.sin(ph) * Math.cos(th), y = Math.abs(Math.cos(ph)), z = Math.sin(ph) * Math.sin(th);
      pos.set([x * 60000, y * 60000 + 500, z * 60000], i * 3);
      const b = 0.4 + Math.random() * 0.6; col.set([b, b, b * (0.9 + Math.random() * 0.2)], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, map: makeStarTexture(), vertexColors: true, transparent: true, depthWrite: false, fog: false, opacity: 0 });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false; this.stars.renderOrder = -9;
    scene.add(this.stars);

    this.hour = 16.5;
    this.night = 0;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this._lastEnvHour = -99;
    this.cloudsOn = true;
  }

  setClouds(on) { this.cloudsOn = on; this.sky.material.uniforms.cloudCoverage.value = on ? 0.32 : 0; }

  setHour(h, force = false) {
    this.hour = h;
    const d = sunDirection(h);
    this.sunDir.copy(d);
    const el = Math.asin(d.y);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(d);
    this.envSky.material.uniforms.sunPosition.value.copy(d);
    // day factor
    const day = THREE.MathUtils.smoothstep(el, -0.1, 0.12);
    const golden = 1 - THREE.MathUtils.smoothstep(el, 0.05, 0.35);
    this.night = 1 - THREE.MathUtils.smoothstep(el, -0.12, 0.02);
    shared.uNight.value = this.night;
    const warm = new THREE.Color().setHSL(0.08, 0.85, 0.62);
    const white = new THREE.Color(0xfff6ea);
    const sunCol = white.clone().lerp(warm, golden * 0.85);
    if (el > -0.02) {
      this.sun.color.copy(sunCol);
      this.sun.intensity = 3.4 * day;
      this.lightDir = d.clone();
    } else {
      // moonlight
      this.sun.color.set(0x8fa6d6);
      this.sun.intensity = 0.6 * this.night;
      this.lightDir = new THREE.Vector3(-0.35, 0.62, 0.45).normalize();
    }
    this.hemi.intensity = 0.3 + 0.5 * day;
    this.hemi.color.set(0xbfd4ff).lerp(new THREE.Color(0x3a4a78), this.night);
    u.nightTint.value.set(0.006, 0.011, 0.026).multiplyScalar(this.night);
    this.hemi.groundColor.set(0x4d4636).lerp(new THREE.Color(0x0a0a10), this.night);
    this.scene.environmentIntensity = 0.12 + 0.75 * day;
    // fog colour follows the horizon
    const fogDay = new THREE.Color(0xb3c4d6), fogGold = new THREE.Color(0xd8a984), fogNight = new THREE.Color(0x0c1424);
    const fc = fogDay.clone().lerp(fogGold, golden * day * 0.75).lerp(fogNight, this.night);
    this.scene.fog.color.copy(fc);
    this.starMat.opacity = this.night * 0.95;
    this.renderer.toneMappingExposure = 0.62 + 0.25 * this.night;
    if (force || Math.abs(h - this._lastEnvHour) > 0.25) { this.updateEnv(); this._lastEnvHour = h; }
  }

  updateEnv() {
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
    this.scene.environment = this.envRT.texture;
  }

  update(dt, camPos) {
    this.sky.material.uniforms.time.value += dt;
    this.sky.position.copy(camPos);
    this.stars.position.copy(camPos);
  }
}
