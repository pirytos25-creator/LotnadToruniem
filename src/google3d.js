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
    if (this.tiles) this.tiles.group.traverse(o => { if (o.material && o.material.userData.g3d) o.material.color.setScalar(k); });
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
    tiles.errorTarget = 14;
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
    tiles.addEventListener('load-root-tileset', () => { if (!failed) onStatus('Połączono. Kafelki 3D spływają…'); });
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
          if (m && !m.userData.g3d) {
            const b = new THREE.MeshBasicMaterial({ map: m.map, fog: true }); b.color.setScalar(this.shade);
            if (b.map) b.map.colorSpace = THREE.SRGBColorSpace;
            b.userData.g3d = true; o.material = b; m.dispose();
          }
        }
      });
    });
    this.scene.add(this.wrapper);
    this.tiles = tiles; this.active = true;
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
