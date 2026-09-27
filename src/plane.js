// A small high-wing trainer (Cessna 172 style) built from primitives. Nose points to -Z.
import * as THREE from 'three';

export function buildPlane() {
  const g = new THREE.Group(); g.name = 'plane';
  const white = new THREE.MeshStandardMaterial({ color: 0xf3f3f0, roughness: 0.35, metalness: 0.1 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc0262d, roughness: 0.4, metalness: 0.1 });
  const navy = new THREE.MeshStandardMaterial({ color: 0x1d2a4a, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2635, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x25272b, roughness: 0.6, metalness: 0.3 });
  const fuselageParts = new THREE.Group(); fuselageParts.name = 'fuselage';

  // fuselage: lathe profile along the length
  const prof = [[0, -4.6], [0.35, -4.5], [0.55, -4.2], [0.62, -3.6], [0.68, -2.4], [0.7, -1.0], [0.66, 0.2], [0.52, 1.2], [0.34, 2.4], [0.18, 3.4], [0.1, 3.9], [0, 4.0]]
    .map(([r, z]) => new THREE.Vector2(r, z));
  const body = new THREE.LatheGeometry(prof, 20);
  body.rotateX(Math.PI / 2); // lathe axis Y -> Z (nose at -Z)
  const bodyM = new THREE.Mesh(body, white);
  bodyM.scale.set(1, 1.18, 1);
  fuselageParts.add(bodyM);
  // stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 6.2), red);
  stripe.position.set(0, -0.05, 0.3); fuselageParts.add(stripe);
  const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(1.43, 0.05, 6.0), navy);
  stripe2.position.set(0, -0.2, 0.3); fuselageParts.add(stripe2);
  // cabin glass
  const cab = new THREE.Mesh(new THREE.SphereGeometry(0.72, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  cab.scale.set(0.98, 0.72, 1.75); cab.position.set(0, 0.52, -1.35); fuselageParts.add(cab);
  // cowling / spinner
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 16), red);
  spinner.rotation.x = -Math.PI / 2; spinner.position.set(0, 0.02, -4.82); g.add(spinner);
  // tail
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(1.6, 0); fin.lineTo(1.4, 1.6); fin.lineTo(0.7, 1.6); fin.closePath();
  const finG = new THREE.ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: false });
  finG.rotateY(Math.PI / 2); finG.translate(-0.04, 0.35, 3.9);
  const finM = new THREE.Mesh(finG, white); fuselageParts.add(finM);
  const finStripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 1.0), red); finStripe.position.set(0, 1.55, 3.1); fuselageParts.add(finStripe);
  const hstab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.95), white); hstab.position.set(0, 0.3, 3.55); fuselageParts.add(hstab);
  // wing (high)
  const wingShape = new THREE.Shape(); wingShape.moveTo(-5.5, 0); wingShape.lineTo(5.5, 0); wingShape.lineTo(5.4, 1.4); wingShape.lineTo(-5.4, 1.4); wingShape.closePath();
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.16, 1.5), white);
  wing.position.set(0, 0.95, -0.9); g.add(wing);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.17, 1.52), red); tip.position.set(5.3 * s, 0.95, -0.9); g.add(tip);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), dark);
    strut.position.set(1.6 * s, 0.3, -0.7); strut.rotation.z = s * 1.02; g.add(strut);
    // nav lights
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff2020 : 0x20ff40 }));
    nav.position.set(5.56 * s, 0.95, -1.2); g.add(nav);
  }
  // gear
  for (const [x, z] of [[-1.1, -0.2], [1.1, -0.2], [0, -3.7]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), dark);
    leg.position.set(x * 0.8, -0.85, z); leg.rotation.z = x * 0.35; fuselageParts.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 14), dark);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, -1.2, z); fuselageParts.add(wheel);
    const pant = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), white); pant.scale.set(0.6, 0.7, 1.5); pant.position.set(x, -1.15, z); fuselageParts.add(pant);
  }
  g.add(fuselageParts);
  // propeller
  const prop = new THREE.Group(); prop.position.set(0, 0.02, -4.75);
  for (const s of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.03), dark);
    blade.position.y = 0.48; const holder = new THREE.Group(); holder.rotation.z = s; holder.add(blade); prop.add(holder);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.98, 32), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  prop.add(disc);
  g.add(prop);
  // strobe (beacon)
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
  beacon.position.set(0, 1.95, 3.2); g.add(beacon);

  // cockpit interior (only shown in cockpit view)
  const cockpit = new THREE.Group(); cockpit.visible = false;
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.8 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.42, 0.12), panelMat); panel.position.set(0, 0.04, -1.95); panel.rotation.x = -0.25; cockpit.add(panel);
  const glare = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.35), panelMat); glare.position.set(0, 0.26, -1.9); cockpit.add(glare);
  const gaugeMat = new THREE.MeshBasicMaterial({ color: 0x0c0d10 }), ringMat = new THREE.MeshBasicMaterial({ color: 0x9aa0a8 });
  for (let i = 0; i < 6; i++) {
    const gx = -0.45 + (i % 3) * 0.2, gy = 0.14 - Math.floor(i / 3) * 0.14;
    const ring = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), ringMat); ring.position.set(gx, gy, -1.88); ring.rotation.x = -0.25; cockpit.add(ring);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.052, 20), gaugeMat); face.position.set(gx, gy, -1.878); face.rotation.x = -0.25; cockpit.add(face);
  }
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), panelMat); post.position.set(0.62 * s, 0.85, -1.75); post.rotation.z = -0.18 * s; post.rotation.x = 0.35; cockpit.add(post);
  }
  const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 6, 16, Math.PI), panelMat); yoke.position.set(-0.3, 0.12, -1.6); yoke.rotation.z = Math.PI; cockpit.add(yoke);
  g.add(cockpit);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  disc.castShadow = false;
  return { group: g, prop, spinner, fuselage: fuselageParts, beacon, cabin: cab, cockpit, blades: prop.children.filter(c => c.isGroup) };
}
