// Extras that make the walk lively: gingerbread hunt, birds, hot-air balloons, a river boat,
// fireworks and a little sound. Everything lives in world coordinates (+X east, +Z south).
import * as THREE from 'three';
import { makeGlowSprite } from './textures.js';

export const FACTS = {
  'Ratusz Staromiejski': 'Jeden z najcenniejszych gotyckich ratuszy w Europie. Wieża ma ok. 40 m i taras widokowy, a w środku działa Muzeum Okręgowe.',
  'Katedra św. Janów': 'W wieży wisi dzwon Tuba Dei z 1500 roku, jeden z największych średniowiecznych dzwonów w Polsce. Tu ochrzczono Mikołaja Kopernika.',
  'Krzywa Wieża': 'Baszta w murach miejskich odchylona od pionu o prawie półtora metra. Legenda mówi, że to kara dla krzywoprzysięskiego krzyżaka.',
  'Dwór Artusa': 'Dawna siedziba bractw kupieckich. Obecny neorenesansowy gmach stoi od końca XIX wieku i jest dziś centrum kultury.',
  'Kościół Mariacki': 'Gotycki kościół franciszkanów bez wieży, za to z ogromnym dachem. W środku mauzoleum królewny Anny Wazówny.',
  'Brama Mostowa': 'Gotycka brama z 1432 roku prowadziła kiedyś wprost na most przez Wisłę.',
  'Brama Żeglarska': 'Gotycka brama od strony Wisły. Tędy szli żeglarze i kupcy z portu, bo Toruń był miastem hanzeatyckim.',
  'Brama Klasztorna': 'Jedna z trzech zachowanych gotyckich bram od strony rzeki. Nazwę wzięła od pobliskiego klasztoru.',
  'Zamek krzyżacki': 'Mieszczanie zburzyli go w 1454 roku, na początku wojny trzynastoletniej. Przetrwała m.in. wieża Gdanisko.',
  'Kościół św. Jakuba': 'Gotycka fara Nowego Miasta, założonego w 1264 roku jako osobne miasto obok Starówki.',
  'Teatr Horzycy': 'Gmach teatru z 1904 roku zaprojektowało słynne wiedeńskie biuro Fellner i Helmer.',
  'Jordanki': 'Centrum Kulturalno-Kongresowe z 2015 roku. Nocą jego szklana elewacja świeci na zmieniające się kolory.',
  'Planetarium': 'Toruńskie planetarium mieści się w dawnym miejskim zbiorniku gazu. Kopuła zastąpiła zbiornik.',
  'CSW Znaki Czasu': 'Centrum Sztuki Współczesnej, otwarte w 2008 roku, tuż za murami Starówki.',
  'Muzeum Etnograficzne': 'W samym centrum miasta stoi skansen z chałupami, wiatrakiem i zagrodami z okolic Torunia.',
  'Dworzec Toruń Miasto': 'Stacja kolejowa położona najbliżej Starego i Nowego Miasta.',
  'Dworzec Toruń Główny': 'Główny dworzec Torunia leży na lewym brzegu Wisły. Do Starówki idzie się stąd przez Most Piłsudskiego.',
  'Arena Toruń': 'Hala widowiskowo-sportowa otwarta w 2014 roku, gra tu m.in. toruńska koszykówka.',
  'Biblioteka UMK': 'Biblioteka Uniwersytecka na kampusie Bielany. Uniwersytet nosi imię Mikołaja Kopernika.',
  'Bulwar Filadelfijski': 'Bulwar nad Wisłą nazwany na cześć Filadelfii, miasta partnerskiego Torunia.',
  'Rynek Nowomiejski': 'Serce Nowego Miasta. Przez stulecia było ono osobnym miastem z własnym ratuszem.',
  'Most Piłsudskiego': 'Stalowy most kratowy otwarty w 1934 roku, ma prawie kilometr długości.',
  'Kościół św. Ducha': 'Dawny zbór ewangelicki przy Rynku Staromiejskim z połowy XVIII wieku, dziś kościół akademicki.',
  'Spichrze': 'Gotyckie spichlerze kupców z czasów, gdy Toruń handlował zbożem i piernikami w całej Hanzie.',
};

const RIVER = [[-2886, -16], [-2599, 40], [-2311, 34], [-2024, -6], [-1736, -76], [-1449, -151], [-1161, -230], [-874, -318],
  [-590, -420], [-299, -528], [-11, -579], [276, -671], [563, -768], [851, -878], [1138, -999], [1426, -1104], [1713, -1213],
  [2001, -1304], [2288, -1396], [2576, -1436], [2863, -1491]];

// --------------------------------------------------------------- sound (WebAudio, no files)
class Sound {
  constructor() { this.ctx = null; this.on = true; }
  ensure() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.on = false; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  chime() {
    if (!this.on) return; this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [880, 1318.5, 1760].forEach((f, i) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.09); g.gain.linearRampToValueAtTime(0.18, t + i * 0.09 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.8);
      o.connect(g).connect(this.ctx.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.9);
    });
  }
  boom(dist = 800) {
    if (!this.on) return; this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime + dist / 340;
    const len = 1.2, buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = this.ctx.createGain(); g.gain.value = Math.min(0.5, 250 / dist);
    s.connect(f).connect(g).connect(this.ctx.destination); s.start(t);
  }
}

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9);
  s.bezierCurveTo(-0.3, -0.6, -1.0, -0.25, -1.0, 0.25);
  s.bezierCurveTo(-1.0, 0.75, -0.45, 0.95, 0, 0.55);
  s.bezierCurveTo(0.45, 0.95, 1.0, 0.75, 1.0, 0.25);
  s.bezierCurveTo(1.0, -0.25, 0.3, -0.6, 0, -0.9);
  return s;
}

export class Fun {
  constructor(scene, places, store, toast) {
    this.scene = scene; this.store = store; this.toast = toast;
    this.sound = new Sound();
    this.sound.on = store.get('sound', true);
    this.group = new THREE.Group(); this.group.name = 'fun';
    scene.add(this.group);
    this.t = 0;
    this.glowTex = makeGlowSprite();

    // ---- gingerbread hearts over landmarks
    const got = new Set(store.get('pierniki', []));
    this.collected = got;
    const shape = heartShape();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 3, curveSegments: 18 });
    geo.center();
    const icingPts = shape.getSpacedPoints(80).map(p => new THREE.Vector3(p.x * 0.82, p.y * 0.82 + 0.02, 0));
    const icingGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(icingPts, true), 120, 0.045, 6, true);
    const brown = new THREE.MeshStandardMaterial({ color: 0x8a4a1f, roughness: 0.55, metalness: 0.0, emissive: 0x3a1a05, emissiveIntensity: 0.6 });
    const icing = new THREE.MeshStandardMaterial({ color: 0xfff8ee, roughness: 0.4, emissive: 0x333333 });
    this.pierniki = places.map(p => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(geo, brown); g.add(body);
      for (const s of [1, -1]) { const ic = new THREE.Mesh(icingGeo, icing); ic.position.z = 0.33 * s; g.add(ic); }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffc36b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
      glow.scale.setScalar(6); g.add(glow);
      g.scale.setScalar(4.5);
      g.userData = { place: p, base: 0, phase: Math.random() * 6.28 };
      g.visible = !got.has(p.name);
      this.group.add(g);
      return g;
    });
    this.placeY = (h) => { for (const g of this.pierniki) g.userData.base = h(g.userData.place); };

    // ---- birds: flocks of gulls circling over the river and the Old Town
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.25, 0, 0, 0.3, 1.1, 0.05, 0.05], 3));
    wing.computeVertexNormals();
    const birdMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8, side: THREE.DoubleSide });
    this.nBirds = 42;
    this.wingL = new THREE.InstancedMesh(wing, birdMat, this.nBirds);
    this.wingR = new THREE.InstancedMesh(wing, birdMat, this.nBirds);
    this.wingL.frustumCulled = this.wingR.frustumCulled = false;
    this.group.add(this.wingL, this.wingR);
    const centres = [[-420, -700, 95], [120, -760, 110], [-900, -330, 80]];
    this.birds = Array.from({ length: this.nBirds }, (_, i) => {
      const c = centres[i % 3];
      return { cx: c[0] + (Math.random() - 0.5) * 120, cz: c[1] + (Math.random() - 0.5) * 120, alt: c[2] + Math.random() * 40, r: 60 + Math.random() * 90,
        w: (0.12 + Math.random() * 0.1) * (Math.random() < 0.5 ? 1 : -1), ph: Math.random() * 6.28, flap: 5 + Math.random() * 3, scale: 0.9 + Math.random() * 0.5 };
    });

    // ---- hot-air balloons drifting high above the city
    this.balloons = [];
    const palettes = [[0xd6322b, 0xf2c14e], [0x2b6cb0, 0xffffff], [0x3a8f4f, 0xf5e6c8], [0x8b2fc9, 0xf29e4c]];
    palettes.forEach((pal, i) => {
      const b = new THREE.Group();
      const prof = [];
      for (let k = 0; k <= 14; k++) { const t = k / 14; const y = -1 + t * 2.1; const r = Math.sin(Math.PI * Math.min(1, t * 1.12)) * (0.65 + 0.35 * t) + (t < 0.08 ? 0.12 : 0); prof.push(new THREE.Vector2(Math.max(0.12, r), y)); }
      const env = new THREE.LatheGeometry(prof, 24);
      const col = new Float32Array(env.attributes.position.count * 3), c1 = new THREE.Color(pal[0]), c2 = new THREE.Color(pal[1]);
      for (let v = 0; v < env.attributes.position.count; v++) {
        const x = env.attributes.position.getX(v), z = env.attributes.position.getZ(v);
        const seg = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 12);
        const c = seg % 2 ? c1 : c2; col.set([c.r, c.g, c.b], v * 3);
      }
      env.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const envM = new THREE.Mesh(env, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
      envM.scale.setScalar(9); envM.position.y = 12; b.add(envM);
      const basket = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.2), new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 0.9 }));
      b.add(basket);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.scale.setScalar(4); flame.position.y = 3; b.add(flame);
      b.userData = { ang: i * 1.57, r: 900 + i * 350, alt: 320 + i * 70, speed: 0.012 + i * 0.003, flame, cx: -300 + i * 150, cz: -800 - i * 100 };
      this.group.add(b); this.balloons.push(b);
    });

    // ---- a river cruise boat ("Katarzynka" style) going up and down the Vistula
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 26), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 }));
    hull.position.y = 0.5; boat.add(hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(6.05, 0.35, 26.05), new THREE.MeshStandardMaterial({ color: 0x1d3f7a })); stripe.position.y = 0.2; boat.add(stripe);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.2, 14), new THREE.MeshStandardMaterial({ color: 0xe8eef4, roughness: 0.3, metalness: 0.1 }));
    cabin.position.set(0, 2.3, -1); boat.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 15), new THREE.MeshStandardMaterial({ color: 0xc0262d })); roof.position.set(0, 3.5, -1); boat.add(roof);
    this.boatLight = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffe0a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.boatLight.scale.set(16, 6, 1); this.boatLight.position.y = 2.5; boat.add(this.boatLight);
    boat.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.boat = boat; this.boatU = 0.35; this.boatDir = 1;
    this.river = new THREE.CatmullRomCurve3(RIVER.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    this.group.add(boat);

    // ---- fireworks (particle bursts)
    this.fw = [];
    this.fwTimer = 6;
  }

  setHeights(heightAt, waterAt) {
    this.heightAt = heightAt; this.waterAt = waterAt;
  }

  // fireworks burst at world position
  burst(pos, color) {
    const n = 220, p = new Float32Array(n * 3), v = new Float32Array(n * 3);
    const c = new THREE.Color(color ?? new THREE.Color().setHSL(Math.random(), 0.9, 0.6));
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * 6.283, s = Math.sqrt(1 - u * u), sp = 38 + Math.random() * 12;
      v.set([s * Math.cos(th) * sp, u * sp, s * Math.sin(th) * sp], i * 3); p.set([pos.x, pos.y, pos.z], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ size: 7, map: this.glowTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false;
    this.group.add(pts);
    this.fw.push({ pts, v, life: 0, max: 2.6 });
  }
  show(camPos, count = 5) {
    // a little show over the river in front of the Old Town
    for (let i = 0; i < count; i++) setTimeout(() => {
      const pos = new THREE.Vector3(-420 + (Math.random() - 0.5) * 500, 34 + 140 + Math.random() * 80, -560 + (Math.random() - 0.5) * 120);
      this.burst(pos); this.sound.boom(pos.distanceTo(camPos));
    }, i * 450 + Math.random() * 300);
  }

  resetHunt() { this.collected.clear(); this.store.set('pierniki', []); for (const g of this.pierniki) g.visible = true; }

  update(dt, camPos, night, enabled = true) {
    this.t += dt;
    const t = this.t;
    this.group.visible = enabled;
    if (!enabled) return;
    // gingerbread: spin, bob, collect
    for (const g of this.pierniki) {
      if (!g.visible) continue;
      const u = g.userData;
      g.position.set(u.place.x, u.base + 4 * Math.sin(t * 1.3 + u.phase), u.place.z);
      g.rotation.y = t * 1.2 + u.phase;
      const d = g.position.distanceTo(camPos);
      g.children[3].material.opacity = 0.55 + 0.35 * Math.sin(t * 3 + u.phase);
      if (d < 38) {
        g.visible = false;
        this.collected.add(u.place.name);
        this.store.set('pierniki', [...this.collected]);
        this.sound.chime();
        const n = this.collected.size, all = this.pierniki.length;
        this.toast(`🍪 Piernik ${n}/${all} · ${u.place.name}`, FACTS[u.place.name] || '');
        if (n === all) { this.toast('🎆 Wszystkie pierniki zebrane!', 'Toruń świętuje. Pokaz fajerwerków nad Wisłą.'); this.show(camPos, 12); }
      }
    }
    // birds
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qw = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
    const ground = this.heightAt || (() => 35);
    this.birds.forEach((b, i) => {
      const a = b.ph + t * b.w;
      p.set(b.cx + Math.cos(a) * b.r, 0, b.cz + Math.sin(a) * b.r);
      p.y = Math.max(ground(p.x, p.z), 34) + b.alt + Math.sin(t * 0.7 + b.ph) * 6;
      const vx = -Math.sin(a) * b.w, vz = Math.cos(a) * b.w;
      q.setFromEuler(e.set(0, Math.atan2(-vx, -vz), -0.35 * Math.sign(b.w)));
      const flap = Math.sin(t * b.flap + b.ph) * 0.6;
      s.setScalar(b.scale * 1.4);
      qw.setFromEuler(e.set(0, 0, flap)); m4.compose(p, q.clone().multiply(qw), s); this.wingR.setMatrixAt(i, m4);
      qw.setFromEuler(e.set(0, Math.PI, -flap)); m4.compose(p, q.clone().multiply(qw), s); this.wingL.setMatrixAt(i, m4);
    });
    this.wingL.instanceMatrix.needsUpdate = this.wingR.instanceMatrix.needsUpdate = true;
    this.wingL.visible = this.wingR.visible = night < 0.6;
    // balloons
    for (const b of this.balloons) {
      const u = b.userData; u.ang += u.speed * dt;
      b.position.set(u.cx + Math.cos(u.ang) * u.r, u.alt + Math.sin(t * 0.2 + u.r) * 15, u.cz + Math.sin(u.ang) * u.r);
      u.flame.material.opacity = (Math.sin(t * 0.9 + u.r) > 0.85 ? 1 : 0.15) * (0.4 + night);
    }
    // boat: 6 m/s up and down the river
    this.boatU += this.boatDir * 6 * dt / this.river.getLength();
    if (this.boatU > 0.97 || this.boatU < 0.03) this.boatDir *= -1;
    const bp = this.river.getPointAt(this.boatU), bt = this.river.getTangentAt(this.boatU).multiplyScalar(this.boatDir);
    const wy = this.waterAt ? this.waterAt(bp.x, bp.z) : 33;
    this.boat.position.set(bp.x, wy + 0.3 + Math.sin(t * 1.4) * 0.12, bp.z);
    this.boat.rotation.set(0, Math.atan2(-bt.x, -bt.z), Math.sin(t * 0.9) * 0.02);
    this.boatLight.material.opacity = night;
    // fireworks: automatic at night now and then
    if (night > 0.6) { this.fwTimer -= dt; if (this.fwTimer < 0) { this.fwTimer = 14 + Math.random() * 16; this.show(camPos, 3 + (Math.random() * 3 | 0)); } }
    for (let i = this.fw.length - 1; i >= 0; i--) {
      const f = this.fw[i]; f.life += dt;
      const pos = f.pts.geometry.attributes.position, v = f.v;
      for (let k = 0; k < pos.count; k++) {
        v[k * 3 + 1] -= 9.8 * dt * 0.6; v[k * 3] *= 0.985; v[k * 3 + 1] *= 0.985; v[k * 3 + 2] *= 0.985;
        pos.array[k * 3] += v[k * 3] * dt; pos.array[k * 3 + 1] += v[k * 3 + 1] * dt; pos.array[k * 3 + 2] += v[k * 3 + 2] * dt;
      }
      pos.needsUpdate = true;
      f.pts.material.opacity = Math.max(0, 1 - f.life / f.max);
      if (f.life > f.max) { this.group.remove(f.pts); f.pts.geometry.dispose(); f.pts.material.dispose(); this.fw.splice(i, 1); }
    }
  }
}
