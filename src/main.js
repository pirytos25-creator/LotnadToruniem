// Lot nad Toruniem — main entry: renderer, world assembly, input, cameras, loop.
import * as THREE from 'three';
import { CSM, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } from 'extras';
import { fetchJSON, fetchBin, Terrain, Obstacles } from './data.js';
import { buildGround, buildWater } from './terrain.js';
import { buildCity } from './buildings.js';
import { buildTrees } from './trees.js';
import { buildBridges } from './bridges.js';
import { Atmosphere } from './sky.js';
import { makeFacadeAtlas, makeRoofAtlas, makeWaterNormals, makeGlowSprite } from './textures.js';
import { facadeMaterial, roofMaterial, shared } from './materials.js';
import { Walker, Tour } from './walk.js';
import { HUD } from './hud.js';
import { Google3D } from './google3d.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('lot:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lot:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches;

function progress(frac, msg) {
  $('loadbar').style.width = `${Math.round(frac * 100)}%`;
  if (msg) $('loadmsg').textContent = msg;
}
const tick = () => new Promise(r => setTimeout(r, 0));

// Start above Kępa Bazarowa, looking north at the classic Old Town panorama across the Vistula
const START = { x: -390, z: -330, y: 150, yaw: 0, pitch: -0.2 };
// Calm tour: along the river, over the Old Town and the New Town, back along the walls
const ROUTE = [
  { x: -1300, z: -420, alt: 150 }, { x: -700, z: -470, alt: 140 }, { x: -250, z: -560, alt: 140 },
  { x: 150, z: -700, alt: 150 }, { x: 250, z: -980, alt: 160 }, { x: 60, z: -1220, alt: 160 },
  { x: -300, z: -1150, alt: 150 }, { x: -560, z: -1000, alt: 145 }, { x: -700, z: -800, alt: 140 },
  { x: -1000, z: -700, alt: 150 },
];

async function main() {
  const canvas = $('gl');
  const quality = { value: params.get('q') || store.get('quality', isTouch ? 'low' : 'high') };
  $('quality').value = quality.value;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality.value === 'high' ? 1.5 : quality.value === 'med' ? 1.25 : 0.9));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.8, 90000);
  camera.position.set(START.x, START.y + 10, START.z + 30);
  const atmo = new Atmosphere(renderer, scene);

  // ----------------------------------------------------------------- load data
  progress(0.03, 'Pobieram dane miasta…');
  const texLoader = new THREE.TextureLoader();
  let done = 0; const bump = (m) => { done++; progress(0.05 + done * 0.07, m); };
  const [city, terBuf, treeBuf, lightBuf, photos, mask] = await Promise.all([
    fetchJSON('assets/city.json').then(r => (bump('Budynki z OpenStreetMap'), r)),
    fetchBin('assets/terrain.bin').then(r => (bump('Model terenu'), r)),
    fetchBin('assets/trees.bin').then(r => (bump('Drzewa'), r)),
    fetchBin('assets/lights.bin').then(r => (bump('Latarnie'), r)),
    fetchJSON('assets/photos.json').then(r => (bump('Fotografie zabytków'), r.photos)),
    texLoader.loadAsync('assets/watermask.png').then(r => (bump('Wisła'), r)),
  ]);
  const W = city.W, H = W / 2;
  const terrain = new Terrain(terBuf, city);
  const obstacles = new Obstacles(W, 1024);

  // ----------------------------------------------------------------- shadows (cascaded)
  const csm = new CSM({
    camera, parent: scene, cascades: quality.value === 'high' ? 3 : 2, maxFar: quality.value === 'high' ? 6000 : 3500,
    shadowMapSize: quality.value === 'high' ? 2048 : 1024, lightDirection: new THREE.Vector3(-0.5, -1, 0.3).normalize(),
    lightIntensity: 3, lightFar: 9000, lightMargin: 600, shadowBias: -0.0002, mode: 'practical',
  });
  csm.fade = true;
  for (const l of csm.lights) { l.shadow.normalBias = 0.6; }
  const setupMat = (m) => { csm.setupMaterial(m); return m; };

  progress(0.5, 'Teren i zdjęcia lotnicze…'); await tick();
  const ground = buildGround(city, terrain, texLoader, quality);
  ground.chunks.forEach(c => setupMat(c.mat)); setupMat(ground.far.material);
  scene.add(ground.group);

  const water = buildWater(city, terrain, mask, makeWaterNormals());
  chainCSM(csm, water.mat);
  scene.add(water.group);

  progress(0.58, 'Stawiam 15 tysięcy budynków…'); await tick();
  const facadeTex = makeFacadeAtlas(), roofTex = makeRoofAtlas();
  const city3d = buildCity(city, terrain, obstacles);
  const facadeM = chainCSM(csm, facadeMaterial(facadeTex));
  const roofMs = ground.chunks.map(c => chainCSM(csm, roofMaterial(roofTex, c.photo, new THREE.Vector4(c.x0, c.z0, c.size, c.pad))));
  const cityGroup = new THREE.Group(); cityGroup.name = 'city';
  city3d.walls.forEach((b, i) => {
    if (!b.n) return;
    const wm = new THREE.Mesh(b.geometry(), facadeM); wm.castShadow = true; wm.receiveShadow = true; cityGroup.add(wm);
    const rb = city3d.roofs[i];
    if (rb.n) { const rm = new THREE.Mesh(rb.geometry(), roofMs[i]); rm.castShadow = true; rm.receiveShadow = true; cityGroup.add(rm); }
  });
  scene.add(cityGroup);

  progress(0.72, 'Mosty na Wiśle…'); await tick();
  const bridges = buildBridges(city, terrain, obstacles);
  setupMat(bridges.material);
  scene.add(bridges);

  progress(0.8, 'Sadzę drzewa…'); await tick();
  const trees = buildTrees(treeBuf, city, terrain, obstacles);
  setupMat(trees.mat);
  scene.add(trees.group);

  // street lights (night)
  const ldv = new DataView(lightBuf), nL = lightBuf.byteLength / 4;
  const lpos = new Float32Array(nL * 3);
  for (let i = 0; i < nL; i++) {
    const x = ldv.getInt16(i * 4, true) / 10, z = ldv.getInt16(i * 4 + 2, true) / 10;
    lpos.set([x, terrain.heightAt(x, z) + 8, z], i * 3);
  }
  const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
  const lmat = new THREE.PointsMaterial({ size: 13, map: makeGlowSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc27a, opacity: 0, sizeAttenuation: true });
  const lampPoints = new THREE.Points(lgeo, lmat); lampPoints.frustumCulled = false; lampPoints.visible = false;
  scene.add(lampPoints);

  // ----------------------------------------------------------------- aerial walk
  progress(0.9, 'Przygotowuję spacer…'); await tick();
  const walker = new Walker();
  const flight = walker; // HUD reads the same fields
  const floorAt = (x, z) => {
    if (google.active) return google.heightAt(x, z, terrain.heightAt(x, z));
    return Math.max(terrain.heightAt(x, z), obstacles.near(x, z, 12));
  };
  const respawn = () => { walker.reset(START.x, START.y, START.z, START.yaw, START.pitch); if (window.__snap) window.__snap.cam = true; };
  respawn();
  const google = new Google3D(scene, camera, renderer);
  const autopilot = new Tour(ROUTE, (x, z) => terrain.heightAt(x, z));

  const hud = new HUD(city, photos, 'assets/overview.jpg');
  // better label anchors: tallest named building near each place
  for (const p of hud.places) {
    let best = null, bd = 90;
    for (const n of city3d.named) { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; best = n; } }
    p.top = best ? best.top : terrain.heightAt(p.x, p.z) + 25;
  }

  // ----------------------------------------------------------------- post (bloom at night)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.5, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ----------------------------------------------------------------- settings
  let hour = params.has('t') ? parseFloat(params.get('t')) : store.get('hour', 16.5);
  const todEl = $('tod'), todVal = $('todVal');
  const fmtH = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  function applyHour(h, force) {
    hour = (h + 24) % 24; atmo.setHour(hour, force); todEl.value = hour; todVal.textContent = fmtH(hour); store.set('hour', hour);
    const d = atmo.lightDir.clone().negate();
    csm.lightDirection.copy(d);
    for (const l of csm.lights) { l.color.copy(atmo.sun.color); l.intensity = atmo.sun.intensity; }
    const night = atmo.night;
    lampPoints.visible = night > 0.05; lmat.opacity = Math.min(1, night * 1.2);
    water.mat.color.set(0x27423f).lerp(new THREE.Color(0x05080c), night * 0.8);
    google.setShade(1 - night * 0.82);
  }
  applyHour(hour, true);
  todEl.addEventListener('input', () => applyHour(parseFloat(todEl.value)));
  const opt = { shadows: store.get('shadows', quality.value !== 'low'), clouds: store.get('clouds', true), trees: store.get('trees', true), labels: store.get('labels', true) };
  const applyOpts = () => {
    for (const l of csm.lights) l.castShadow = opt.shadows;
    renderer.shadowMap.enabled = opt.shadows;
    atmo.setClouds(opt.clouds); hud.labelsOn = opt.labels;
    $('optShadows').checked = opt.shadows; $('optClouds').checked = opt.clouds; $('optTrees').checked = opt.trees; $('optLabels').checked = opt.labels;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  };
  applyOpts();
  for (const [id, k] of [['optShadows', 'shadows'], ['optClouds', 'clouds'], ['optTrees', 'trees'], ['optLabels', 'labels']]) {
    $(id).addEventListener('change', (e) => { opt[k] = e.target.checked; store.set(k, opt[k]); applyOpts(); });
  }
  $('quality').addEventListener('change', (e) => { store.set('quality', e.target.value); location.reload(); });

  // Google 3D
  const gStatus = (m) => { $('gStatus').textContent = m; $('gStatus2').textContent = m; };
  $('gkey').value = store.get('gkey', ''); $('gkey2').value = store.get('gkey', '');
  const setGoogle = async (on) => {
    if (on) {
      const key = $('gkey').value.trim();
      if (!key) { gStatus('Wklej najpierw klucz API.'); return; }
      store.set('gkey', key);
      try { await google.enable(key, gStatus); } catch (e) { gStatus('Nie udało się: ' + e.message); return; }
    } else { google.disable(); gStatus('Tryb rekonstrukcji z OSM.'); }
    const on3 = google.active;
    cityGroup.visible = !on3; trees.group.visible = !on3; bridges.visible = !on3; water.group.visible = !on3;
    lampPoints.visible = !on3 && atmo.night > 0.05;
    ground.chunks.forEach(c => { c.mesh.visible = !on3; });
    ground.far.visible = !on3; ground.disc.visible = !on3;
    store.set('g3d', on3);
  };
  $('gOn').addEventListener('click', () => setGoogle(true));
  $('gOn2').addEventListener('click', async () => {
    $('gkey').value = $('gkey2').value;
    await setGoogle(true);
    if (google.active) setTimeout(() => toggle('welcome', false), 600);
  });
  $('openWelcome').addEventListener('click', () => { toggle('settings', false); toggle('welcome', true); });
  $('modeRecon').addEventListener('click', () => { toggle('welcome', false); store.set('mode', 'recon'); if (!store.get('seenHelp', false)) { toggle('help', true); store.set('seenHelp', true); } });
  $('gOff').addEventListener('click', () => setGoogle(false));

  // ----------------------------------------------------------------- input
  const keys = new Set();
  let injected = null;
  const toggleTour = () => {
    if (autopilot.active) autopilot.stop(); else autopilot.start(walker);
    $('tourName').textContent = autopilot.active ? 'Zatrzymaj spacer' : 'Spacer z przewodnikiem';
    document.querySelector('[data-act=tour]').classList.toggle('on', autopilot.active);
  };
  const panels = { help: $('help'), settings: $('settings'), welcome: $('welcome') };
  const toggle = (name, force) => { const p = panels[name]; p.hidden = force !== undefined ? !force : !p.hidden; };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'Equal' || e.code === 'NumpadAdd') walker.setPace(1);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') walker.setPace(-1);
    if (e.code === 'KeyT') toggleTour();
    if (e.code === 'KeyH') toggle('help');
    if (e.code === 'KeyO') toggle('settings');
    if (e.code === 'KeyN') applyHour(atmo.night > 0.5 ? 13 : 21.5, true);
    if (e.code === 'Home') { respawn(); if (autopilot.active) toggleTour(); }
    if (e.code === 'Escape') { toggle('help', false); toggle('settings', false); toggle('welcome', false); }
    if (['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyQ', 'KeyE', 'Space', 'KeyC', 'ArrowLeft', 'ArrowRight'].includes(e.code) && autopilot.active) toggleTour();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => toggle(b.dataset.close, false)));
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'help') toggle('help'); if (a === 'settings') toggle('settings');
    if (a === 'tour') toggleTour();
    b.blur();
  }));
  $('minimap').addEventListener('click', (ev) => {
    const p = hud.minimapToWorld(ev);
    const y = Math.max(walker.pos.y, terrain.heightAt(p.x, p.z) + 160);
    if (autopilot.active) toggleTour();
    walker.reset(p.x, y, p.z + 450, 0, -0.3);
  });

  // mouse look (drag) + pace (wheel)
  const look = { drag: false, dyaw: 0, dpitch: 0 };
  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { look.drag = true; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointerup', () => { look.drag = false; });
  canvas.addEventListener('pointermove', (e) => {
    if (!look.drag) return;
    look.dyaw -= e.movementX * 0.0032; look.dpitch -= e.movementY * 0.0028;
  });
  canvas.addEventListener('wheel', (e) => { walker.setPace(e.deltaY < 0 ? 1 : -1); }, { passive: true });

  // touch controls
  const touch = { x: 0, y: 0, thr: null };
  if (isTouch) {
    $('touch').hidden = false;
    const stick = $('stick'), knob = stick.querySelector('i'), tt = $('tthr'), tk = tt.querySelector('i');
    const stickMove = (e) => {
      const r = stick.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      touch.x = THREE.MathUtils.clamp(dx, -1, 1); touch.y = THREE.MathUtils.clamp(dy, -1, 1);
      knob.style.transform = `translate(calc(-50% + ${touch.x * 40}px), calc(-50% + ${touch.y * 40}px))`;
    };
    stick.addEventListener('pointerdown', (e) => { stick.setPointerCapture(e.pointerId); stickMove(e); });
    stick.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') stickMove(e); });
    stick.addEventListener('pointerup', () => { touch.x = 0; touch.y = 0; knob.style.transform = ''; });
    const thrMove = (e) => {
      const r = tt.getBoundingClientRect();
      const v = 1 - THREE.MathUtils.clamp((e.clientY - r.top) / r.height, 0, 1);
      touch.thr = v; tk.style.top = `${(1 - v) * 100}%`;
    };
    tt.addEventListener('pointerdown', (e) => { tt.setPointerCapture(e.pointerId); thrMove(e); });
    tt.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') thrMove(e); });
    tt.addEventListener('pointerup', () => { touch.thr = 0.5; tk.style.top = '50%'; });
  }

  function readInput() {
    const k = injected || keys;
    const inp = { fwd: 0, strafe: 0, up: 0, turn: 0, look: 0, lookYaw: look.dyaw, lookPitch: look.dpitch };
    look.dyaw = 0; look.dpitch = 0;
    if (k.has('KeyW')) inp.fwd += 1;
    if (k.has('KeyS')) inp.fwd -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) inp.turn += 1;    // A = turn LEFT
    if (k.has('KeyD') || k.has('ArrowRight')) inp.turn -= 1;
    if (k.has('KeyQ')) inp.strafe -= 1;
    if (k.has('KeyE')) inp.strafe += 1;
    if (k.has('Space') || k.has('KeyR')) inp.up += 1;
    if (k.has('KeyC') || k.has('KeyF')) inp.up -= 1;
    if (k.has('ArrowUp')) inp.look += 1;
    if (k.has('ArrowDown')) inp.look -= 1;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) { inp.fwd *= 2; inp.strafe *= 2; }
    if (isTouch) {
      inp.turn += -touch.x; inp.fwd += -touch.y;
      if (touch.thr !== null) inp.up += Math.abs(touch.thr - 0.5) > 0.12 ? (touch.thr - 0.5) * 2 : 0;
    }
    return inp;
  }

  // test probe (A/D sign check etc.)
  window.__controlsTest = {
    setKeys: (codes) => { injected = codes ? new Set(codes) : null; },
    getYaw: () => walker.heading(), getSpeed: () => walker.speed,
    getPos: () => walker.pos.toArray(), resetPose: respawn,
    hop: (x, z, y, yaw = 0, pitch = -0.3) => { walker.reset(x, y ?? terrain.heightAt(x, z) + 150, z, yaw, pitch); if (window.__snap) window.__snap.cam = true; },
    setHour: (h) => applyHour(h, true), walker, camera, scene, renderer, city3d, obstacles, terrain, google,
  };

  // ----------------------------------------------------------------- resize
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    csm.updateFrustums();
  });

  // ----------------------------------------------------------------- loop
  progress(1, 'Gotowe — startujemy!');
  $('hud').hidden = false;
  setTimeout(() => $('loader').classList.add('fade'), 150);
  setTimeout(() => $('loader').remove(), 1200);
  if (!params.has('nohelp')) {
    if (!store.get('mode', null) && !store.get('gkey', '')) toggle('welcome', true);
    else if (!store.get('seenHelp', false)) { toggle('help', true); store.set('seenHelp', true); }
  }
  if (store.get('g3d', false) && store.get('gkey', '')) setGoogle(true);

  const clock = new THREE.Clock();
  const snap = { cam: true };
  window.__snap = snap;
  let t = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    shared.uTime.value = t; water.timeU.value = t;

    // aerial walk
    const paused = !panels.welcome.hidden;
    walker.minAGL = google.active ? 45 : 25;
    if (!paused) {
      if (autopilot.active) { autopilot.step(dt, walker); readInput(); }
      else walker.step(dt, readInput(), floorAt);
    }
    camera.position.copy(walker.pos);
    if (snap.cam) snap.cam = false;
    camera.rotation.set(walker.pitch, walker.yaw, 0, 'YXZ');
    camera.near = 1.5;
    camera.far = google.active ? 45000 : 90000;
    camera.fov = 60;
    camera.updateProjectionMatrix();

    // world updates
    atmo.update(dt, camera.position);
    if (!google.active) {
      ground.update(camera.position);
      trees.update(camera.position, quality.value, opt.trees);
    } else google.update();
    csm.update();

    // HUD
    const gh = terrain.heightAt(flight.pos.x, flight.pos.z);
    hud.update(dt, flight, google.active ? floorAt(flight.pos.x, flight.pos.z) : gh, google.active ? 0 : obstacles.near(flight.pos.x, flight.pos.z, 5), camera,
      { heightAt: (x, z) => terrain.heightAt(x, z), route: autopilot.active ? ROUTE : null, tour: autopilot.active, pace: walker.pace });
    $('gAttrib').textContent = google.active ? ' · 3D: Google (' + google.provider + ') ' + google.attribution : '';

    // render
    if (atmo.night > 0.3 && quality.value !== 'low') { bloom.strength = 0.55 + atmo.night * 0.35; composer.render(); }
    else renderer.render(scene, camera);
    frameNo++;
    if (!maxFrames || frameNo < maxFrames) requestAnimationFrame(frame);
    else window.__rendered = true;
  }
  let maxFrames = parseInt(params.get('frames') || '0');
  let frameNo = 0;
  window.__renderMore = (n) => { const was = window.__rendered; maxFrames = frameNo + n; window.__rendered = false; if (was) requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
}

function chainCSM(csm, mat) {
  // CSM overwrites onBeforeCompile: capture ours, install CSM, then chain both
  const ours = mat.onBeforeCompile; const key = mat.customProgramCacheKey();
  csm.setupMaterial(mat);
  const theirs = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => { theirs(s, r); ours(s, r); };
  mat.customProgramCacheKey = () => key + '-csm';
  return mat;
}

main().catch((e) => {
  console.error(e);
  $('loadmsg').textContent = 'Błąd: ' + e.message;
});
