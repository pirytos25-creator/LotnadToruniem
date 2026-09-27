// HUD: gauges, compass tape, minimap, landmark labels and "nearby" photo card.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(city, photos, overviewUrl) {
    this.city = city; this.W = city.W; this.H = city.W / 2;
    this.el = { spd: $('spd'), alt: $('alt'), agl: $('agl'), vsi: $('vsi'), thr: $('thr'), tape: $('compassTape'), place: $('place'), placeImg: $('placeImg'), placeName: $('placeName'), placeDist: $('placeDist'), warn: $('warn'), labels: $('labels'), fps: $('fps'), paceVal: $('paceVal') };
    // compass ticks
    const tape = this.el.tape;
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    this.pxPerDeg = 3;
    for (let d = -360; d <= 720; d += 15) {
      const s = document.createElement('span');
      const dd = ((d % 360) + 360) % 360;
      if (names[dd] !== undefined) { s.textContent = names[dd]; s.className = 'c'; }
      else if (dd % 30 === 0) s.textContent = String(dd);
      else s.className = 't';
      s.style.left = `${(d + 360) * this.pxPerDeg}px`;
      tape.appendChild(s);
    }
    // places with photos
    this.places = city.places.map(p => {
      let best = null, bd = 220;
      for (const ph of photos) { const d = Math.hypot(ph.x - p.x, ph.z - p.z); if (d < bd) { bd = d; best = ph; } }
      return { ...p, photo: best ? best.src : null };
    });
    // labels
    this.labelEls = this.places.map(p => {
      const e = document.createElement('div'); e.className = 'lbl'; e.textContent = p.name; e.style.display = 'none';
      this.el.labels.appendChild(e); return e;
    });
    this.labelsOn = true;
    // minimap
    this.mm = $('minimap'); this.mmCtx = this.mm.getContext('2d');
    this.mmImg = new Image(); this.mmImg.src = overviewUrl;
    this.curPlace = null;
    this._v = new THREE.Vector3();
    this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
  }

  update(dt, flight, ground, obstacleTop, camera, extra = {}) {
    const e = this.el;
    e.spd.textContent = Math.round(flight.speed * 3.6);
    e.alt.textContent = Math.round(flight.pos.y);
    const agl = flight.pos.y - Math.max(ground, obstacleTop);
    e.agl.textContent = Math.max(0, Math.round(agl));
    e.vsi.textContent = (flight.vy >= 0 ? '+' : '') + flight.vy.toFixed(1);
    e.thr.style.width = `${Math.round(flight.throttle * 100)}%`;
    if (extra.pace && e.paceVal) e.paceVal.textContent = `${Math.round(extra.pace * 3.6)} km/h`;
    const hdg = flight.heading();
    e.tape.style.transform = `translateX(${170 - (hdg + 360) * this.pxPerDeg}px)`;
    // warnings
    let warn = extra.tour ? 'Spacer z przewodnikiem — dowolny klawisz ruchu przejmuje stery' : '';
    e.warn.hidden = !warn; if (warn) e.warn.textContent = warn;

    // nearby place card
    let best = null, bd = 650;
    if (flight.pos.y - ground < 1100) for (const p of this.places) { const d = Math.hypot(p.x - flight.pos.x, p.z - flight.pos.z); if (d < bd) { bd = d; best = p; } }
    if (best !== this.curPlace) {
      this.curPlace = best;
      e.place.hidden = !best;
      if (best) {
        e.placeName.textContent = best.name;
        if (best.photo) { e.placeImg.src = best.photo; e.placeImg.hidden = false; } else e.placeImg.hidden = true;
        e.place.style.animation = 'none'; void e.place.offsetWidth; e.place.style.animation = '';
      }
    }
    if (best) e.placeDist.textContent = `${Math.round(bd)} m · kierunek ${Math.round((Math.atan2(best.x - flight.pos.x, -(best.z - flight.pos.z)) * 180 / Math.PI + 360) % 360)}°`;

    // labels
    const w = innerWidth, h = innerHeight;
    let shown = 0;
    const placed = [];
    const order = this.places.map((p, i) => [i, Math.hypot(p.x - camera.position.x, p.z - camera.position.z)]).sort((a, b) => a[1] - b[1]);
    order.forEach(([i, d]) => {
      const p = this.places[i];
      const el = this.labelEls[i];
      if (!this.labelsOn || d > 2600 || shown > 10) { el.style.display = 'none'; return; }
      const y = (p.top || extra.heightAt(p.x, p.z) + 30) + 6;
      this._v.set(p.x, y, p.z).project(camera);
      if (this._v.z > 1 || Math.abs(this._v.x) > 1.05 || Math.abs(this._v.y) > 1.05) { el.style.display = 'none'; return; }
      const sx = (this._v.x * 0.5 + 0.5) * w, sy = (-this._v.y * 0.5 + 0.5) * h;
      const tw = p.name.length * 6.5;
      if (placed.some(([x, y, ww]) => Math.abs(x - sx) < (ww + tw) / 2 + 8 && Math.abs(y - sy) < 20)) { el.style.display = 'none'; return; }
      placed.push([sx, sy, tw]);
      el.style.display = '';
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      el.style.opacity = String(Math.min(1, (2600 - d) / 700));
      shown++;
    });

    // minimap
    this.drawMinimap(flight, extra.route);

    // fps
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { e.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps`; this.fpsAcc = 0; this.fpsN = 0; }
  }

  drawMinimap(flight, route) {
    const c = this.mmCtx, S = this.mm.width, W = this.W, H = this.H;
    const toPx = (x, z) => [(x + H) / W * S, (z + H) / W * S];
    c.fillStyle = '#233'; c.fillRect(0, 0, S, S);
    if (this.mmImg.complete) c.drawImage(this.mmImg, 0, 0, S, S);
    c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(0, 0, S, S);
    for (const p of this.places) {
      const [x, y] = toPx(p.x, p.z);
      c.fillStyle = '#f2c14e'; c.beginPath(); c.arc(x, y, 2.2, 0, 7); c.fill();
    }
    if (route) {
      c.strokeStyle = 'rgba(242,193,78,.5)'; c.setLineDash([3, 3]); c.beginPath();
      route.forEach((w, i) => { const [x, y] = toPx(w.x, w.z); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.stroke(); c.setLineDash([]);
    }
    const [px, py] = toPx(flight.pos.x, flight.pos.z);
    const hd = flight.heading() * Math.PI / 180;
    c.save(); c.translate(Math.min(S - 6, Math.max(6, px)), Math.min(S - 6, Math.max(6, py))); c.rotate(hd);
    c.fillStyle = '#e2553b'; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -8); c.lineTo(6, 6); c.lineTo(0, 3); c.lineTo(-6, 6); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }

  minimapToWorld(ev) {
    const r = this.mm.getBoundingClientRect();
    const u = (ev.clientX - r.left) / r.width, v = (ev.clientY - r.top) / r.height;
    return { x: u * this.W - this.H, z: v * this.W - this.H };
  }
}
