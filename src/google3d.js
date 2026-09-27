// Optional photorealistic mode: Google Photorealistic 3D Tiles streamed with 3DTilesRendererJS.
import * as THREE from 'three';
import { ORIGIN } from './data.js';

export class Google3D {
  constructor(scene, camera, renderer) {
    this.scene = scene; this.camera = camera; this.renderer = renderer;
    this.tiles = null; this.active = false; this.wrapper = null;
    this.ray = new THREE.Raycaster(); this.ray.firstHitOnly = true;
    this.groundCache = new Map();
    this._t = 0; this.lastGround = null;
    this.attribution = '';
    this.shade = 1;
  }
  setShade(k) {
    this.shade = k;
    if (this.tiles) this.tiles.group.traverse(o => { if (o.material && o.material.userData.g3d && o.material.color) o.material.color.setScalar(k); });
  }
  async enable(key, onStatus) {
    if (this.tiles) this.disable();
    onStatus('Ładuję moduł 3D Tiles…');
    const X = await import('extras');
    const tiles = new X.TilesRenderer();
    if (key.startsWith('eyJ')) {
      // Cesium ion token: Google Photorealistic 3D Tiles are ion asset 2275207 (no credit card needed)
      tiles.registerPlugin(new X.CesiumIonAuthPlugin({ apiToken: key, assetId: '2275207', autoRefreshToken: true }));
      this.provider = 'Cesium ion';
    } else {
      tiles.registerPlugin(new X.GoogleCloudAuthPlugin({ apiToken: key, autoRefreshToken: true }));
      this.provider = 'Google';
    }
    const draco = new X.DRACOLoader().setDecoderPath('vendor/draco/');
    tiles.registerPlugin(new X.GLTFExtensionsPlugin({ dracoLoader: draco }));
    tiles.registerPlugin(new X.UnloadTilesPlugin());
    tiles.registerPlugin(new X.ReorientationPlugin({ lat: ORIGIN.lat * Math.PI / 180, lon: ORIGIN.lon * Math.PI / 180, height: ORIGIN.geoid }));
    tiles.setCamera(this.camera);
    tiles.setResolutionFromRenderer(this.camera, this.renderer);
    // Photorealistic tiles are heavy: the default 0.4 GB cache fills up quickly and then the
    // renderer stops refining (blurry, flat city). Give it a desktop-sized budget.
    const GB = 2 ** 30;
    const big = (navigator.deviceMemory || 8) >= 8;
    tiles.lruCache.minBytesSize = (big ? 1.0 : 0.45) * GB;
    tiles.lruCache.maxBytesSize = (big ? 1.4 : 0.6) * GB;
    tiles.lruCache.minSize = 9000; tiles.lruCache.maxSize = 14000;
    tiles.downloadQueue.maxJobs = 40;
    tiles.parseQueue.maxJobs = 12;
    this.errorTarget = 10;
    tiles.errorTarget = this.errorTarget;
    window.__g3d = this;
    let failed = false;
    tiles.addEventListener('load-error', (e) => {
      failed = true;
      const msg = String(e?.error?.message || e?.error || 'błąd');
      const ion = this.provider === 'Cesium ion';
      onStatus(/403|401|404|PERMISSION|API key|token/i.test(msg)
        ? (ion ? 'Cesium odrzucił token — sprawdź, czy dodałeś „Google Photorealistic 3D Tiles” do swoich assetów (Asset Depot → Add to my assets).'
               : 'Google odrzucił klucz (sprawdź, czy włączone jest Map Tiles API i czy klucz nie ma ograniczeń domeny).')
        : `Błąd ładowania: ${msg}`);
    });
    tiles.addEventListener('load-root-tileset', () => { tiles.errorTarget = this.errorTarget; if (!failed) onStatus('Połączono. Kafelki 3D spływają…'); });
    tiles.addEventListener('tiles-load-end', () => { if (!failed) onStatus(`Fotorealistyczny Toruń aktywny (${this.provider}).`); });
    // ENU frame from the plugin: X west, Z north -> rotate to X east, Z south
    this.wrapper = new THREE.Group(); this.wrapper.rotation.y = Math.PI; this.wrapper.add(tiles.group);
    tiles.group.traverse(o => { o.castShadow = false; });
    tiles.addEventListener('load-model', ({ scene }) => {
      scene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = false; o.receiveShadow = false;
          // photogrammetry already contains lighting; keep it unlit-ish
          const m = o.material;
          if (m && m.map && !m.userData.g3d) {
            const b = new THREE.MeshBasicMaterial({ map: m.map, fog: true, side: m.side });
            b.color.setScalar(this.shade);
            b.map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
            b.userData.g3d = true; o.material = b;
          } else if (m) { m.userData.g3d = true; }
        }
      });
    });
    this.scene.add(this.wrapper);
    this.tiles = tiles; this.active = true;
  }
  stats() {
    const t = this.tiles; if (!t) return null;
    let maxDepth = 0; t.visibleTiles.forEach(x => { maxDepth = Math.max(maxDepth, x.internal ? x.internal.depth : (x.__depth || 0)); });
    return { visible: t.visibleTiles.size, downloading: t.stats.downloading, parsing: t.stats.parsing, loaded: t.stats.loaded, cacheMB: Math.round(t.lruCache.cachedBytes / 1048576), full: t.lruCache.isFull(), errorTarget: t.errorTarget, maxDepth };
  }
  disable() {
    if (!this.tiles) return;
    this.scene.remove(this.wrapper);
    this.tiles.dispose();
    this.tiles = null; this.wrapper = null; this.active = false; this.groundCache.clear();
  }
  update() {
    if (!this.tiles) return;
    this.camera.updateMatrixWorld();
    this.tiles.setResolutionFromRenderer(this.camera, this.renderer);
    if (this.tiles.errorTarget !== this.errorTarget) this.tiles.errorTarget = this.errorTarget;
    this.tiles.update();
    if (this.tiles.getAttributions) {
      const a = []; this.tiles.getAttributions(a);
      this.attribution = a.filter(x => x.type === 'string').map(x => x.value).join(' ');
    }
  }
  // ground (or roof) height under a point, cached on a 20 m grid
  heightAt(x, z, fallback) {
    if (!this.tiles) return fallback;
    const key = `${Math.round(x / 20)},${Math.round(z / 20)}`;
    const now = performance.now();
    const c = this.groundCache.get(key);
    if (c && now - c.t < 3000) return c.h;
    this.ray.set(new THREE.Vector3(x, 3000, z), new THREE.Vector3(0, -1, 0));
    const hit = this.ray.intersectObject(this.tiles.group, true)[0];
    const h = hit ? hit.point.y : fallback;
    this.groundCache.set(key, { h, t: now });
    if (this.groundCache.size > 4000) this.groundCache.clear();
    return h;
  }
}
