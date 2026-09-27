import { useEffect, useRef, useState, type ReactNode } from "react";
import { Compass, Gauge, Grid3x3, Moon, Mountain, Sun } from "lucide-react";
import { compass, createFlight, headingDeg, stepFlight, type FlightState } from "@/game/flight";
import { mountCity, mountShots, type Shot } from "@/game/city";

type Meta = {
  widthM: number;
  depthM: number;
  minH: number;
  maxH: number;
  elevSize: number;
  exag: number;
  clearance: number;
  places: { name: string; x: number; z: number }[];
  start: { x: number; z: number; yaw: number };
  buildings?: number;
};

type Hud = {
  kmh: number;
  agl: number;
  amsl: number;
  head: string;
  deg: number;
  place: string;
  dist: number;
  throttle: number;
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getRoll: () => number;
      getPos: () => { x: number; y: number; z: number };
      setKeys: (codes: string[]) => void;
      resetPose: () => void;
      hop?: (x: number, z: number) => void;
    };
  }
}

const emptyHud = (): Hud => ({
  kmh: 0,
  agl: 0,
  amsl: 0,
  head: "N",
  deg: 0,
  place: "Toruń",
  dist: 0,
  throttle: 0,
});

export function FlightApp() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [night, setNight] = useState(false);
  const [wire, setWire] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>(emptyHud);
  const [touch, setTouch] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0, on: false });
  const [stats, setStats] = useState({ buildings: 0, photos: 0 });

  const playingRef = useRef(false);
  const pausedRef = useRef(false);
  const nightRef = useRef(false);
  const wireRef = useRef(false);
  const stickRef = useRef({ x: 0, y: 0 });
  const gasRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse), (max-width: 767px)");
    const sync = () => setTouch(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let dead = false;

    const realKeys = new Set<string>();
    let injected: Set<string> | null = null;
    let mouseDX = 0;
    let mouseDY = 0;
    const state: FlightState = createFlight({ x: 0, y: 200, z: 0 });
    let sample = (_x: number, _z: number) => 40;
    let terrainAt = (_x: number, _z: number) => 40;
    let halfW = 1;
    let halfD = 1;
    let exag = 1;
    let places: Meta["places"] = [];
    let start = { x: 0, z: 0, y: 160 };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let stop = () => {};
    void (async () => {
      try {
        const THREE = await import("three");
        const meta = (await (await fetch("/flight/meta.json")).json()) as Meta;
        if (dead) return;
        const elevImg = await loadImage("/flight/elev.png");
        if (dead) return;
        const grid = readElev(elevImg, meta);
        halfW = meta.widthM / 2;
        halfD = meta.depthM / 2;
        exag = meta.exag;
        places = meta.places;
        let roofReal = (_x: number, _z: number) => 0;
        terrainAt = (x, z) => {
          const u = clamp((x + halfW) / meta.widthM, 0, 1);
          const v = clamp((z + halfD) / meta.depthM, 0, 1);
          return bilinear(grid, meta.elevSize, u, v) * meta.exag;
        };
        sample = (x, z) => terrainAt(x, z) + Math.max(meta.clearance, roofReal(x, z) + 1.2) * meta.exag;

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#d5e4ea");
        scene.fog = new THREE.Fog("#d5e4ea", 1400, 7200);

        const camera = new THREE.PerspectiveCamera(58, 1, 0.4, 12000);
        const hemi = new THREE.HemisphereLight("#e7f2f6", "#8d7b62", 0.72);
        const sun = new THREE.DirectionalLight("#fff4e2", 1.35);
        sun.position.set(-0.45, 0.85, 0.25);
        scene.add(hemi, sun);

        const tex = new THREE.TextureLoader().load("/flight/ground.jpg");
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const seg = 168;
        const geo = new THREE.PlaneGeometry(meta.widthM, meta.depthM, seg, seg);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setY(i, terrainAt(pos.getX(i), pos.getZ(i)));
        geo.computeVertexNormals();
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        scene.add(new THREE.Mesh(geo, mat));

        const cityBuf = await (await fetch("/flight/city.bin")).arrayBuffer();
        if (dead) return;
        const city = mountCity(THREE, scene, cityBuf, tex);
        roofReal = city.roofAt;
        let shots: Shot[] = [];
        try {
          const pack = (await (await fetch("/flight/photos.json")).json()) as { photos?: Shot[] };
          shots = pack.photos ?? [];
        } catch {
          shots = [];
        }
        const shotMats = shots.length
          ? mountShots(
              THREE,
              scene,
              shots,
              (x, z) => terrainAt(x, z) + roofReal(x, z) * meta.exag,
              meta.exag,
              new THREE.TextureLoader(),
            )
          : [];
        const cityMats = [...city.materials, ...shotMats];
        const dayColors = cityMats.map((m) => ("color" in m ? (m.color as import("three").Color).clone() : null));
        if (!dead) setStats({ buildings: meta.buildings ?? 11482, photos: shots.length });

        const ground1 = sample(meta.start.x, meta.start.z);
        start = { x: meta.start.x, y: ground1 + 48 * meta.exag, z: meta.start.z };
        Object.assign(state, createFlight(start));

        const craft = buildCraft(THREE);
        scene.add(craft);

        const applyLook = () => {
          const dark = nightRef.current;
          renderer.toneMappingExposure = dark ? 0.28 : 1;
          scene.background = new THREE.Color(dark ? "#1a2430" : "#d5e4ea");
          const fog = scene.fog as import("three").Fog;
          fog.color.set(dark ? "#1a2430" : "#d5e4ea");
          fog.near = dark ? 700 : 1400;
          hemi.intensity = dark ? 0.22 : 0.72;
          hemi.color.set(dark ? "#9bb4d0" : "#e7f2f6");
          sun.intensity = dark ? 0.18 : 1.35;
          sun.color.set(dark ? "#c5d4ea" : "#fff4e2");
          mat.wireframe = wireRef.current;
          mat.color.set(dark && !wireRef.current ? "#9aabbd" : "#ffffff");
          cityMats.forEach((m, i) => {
            const basic = m as import("three").MeshBasicMaterial;
            basic.wireframe = wireRef.current;
            const day = dayColors[i];
            if (!day) return;
            basic.color.copy(day);
            if (dark && !wireRef.current && i === 0) basic.color.set("#9aabbd");
            else if (dark && !wireRef.current) basic.color.multiplyScalar(0.42);
          });
        };

        const resize = () => {
          const w = host.clientWidth || 1;
          const h = host.clientHeight || 1;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(host);

        const resetPose = () => {
          Object.assign(state, createFlight(start));
        };

        window.__controlsTest = {
          getYaw: () => state.yaw,
          getSpeed: () => state.speed,
          getRoll: () => state.roll,
          getPos: () => ({ x: state.x, y: state.y, z: state.z }),
          setKeys: (codes) => {
            injected = new Set(codes);
          },
          resetPose,
          // QA only: hop the craft without changing the flight model
          hop: (x: number, z: number) => {
            state.x = x;
            state.z = z;
            state.y = sample(x, z) + 40 * exag;
            state.pitch = -0.35;
          },
        };

        let hudAt = 0;
        let last = performance.now();
        let raf = 0;
        const loop = (now: number) => {
          if (dead) return;
          const dt = reduced ? 0.016 : Math.min(0.05, (now - last) / 1000);
          last = now;
          applyLook();
          if (playingRef.current && !pausedRef.current) {
            const keys = injected ?? realKeys;
            const stickNow = stickRef.current;
            let roll = 0;
            let pitch = 0;
            let throttle = gasRef.current;
            if (keys.has("KeyA") || keys.has("ArrowLeft")) roll += 1;
            if (keys.has("KeyD") || keys.has("ArrowRight")) roll -= 1;
            if (keys.has("ArrowUp")) pitch += 1;
            if (keys.has("ArrowDown")) pitch -= 1;
            if (keys.has("KeyW")) throttle += 1;
            if (keys.has("KeyS")) throttle -= 1;
            roll += -stickNow.x;
            pitch += stickNow.y;
            state.roll = clamp(state.roll + mouseDX, -1.05, 1.05);
            state.pitch = clamp(state.pitch + mouseDY, -0.5, 0.55);
            mouseDX = 0;
            mouseDY = 0;
            stepFlight(state, { roll: clamp(roll, -1, 1), pitch: clamp(pitch, -1, 1), throttle: clamp(throttle, -1, 1) }, dt, sample);
            state.x = clamp(state.x, -halfW + 40, halfW - 40);
            state.z = clamp(state.z, -halfD + 40, halfD - 40);
          }

          const fx = -Math.sin(state.yaw);
          const fz = -Math.cos(state.yaw);
          craft.position.set(state.x, state.y, state.z);
          craft.rotation.order = "YXZ";
          craft.rotation.y = state.yaw;
          craft.rotation.x = state.pitch;
          craft.rotation.z = state.roll;
          const back = 22;
          const eye = 5.5;
          camera.position.set(state.x - fx * back, state.y + eye + state.pitch * 4, state.z - fz * back);
          camera.lookAt(state.x + fx * 36, state.y - 14, state.z + fz * 36);

          if (now - hudAt > 100) {
            hudAt = now;
            let best = places[0];
            let bestD = Infinity;
            for (const p of places) {
              const d = Math.hypot(state.x - p.x, state.z - p.z);
              if (d < bestD) {
                best = p;
                bestD = d;
              }
            }
            setHud({
              kmh: Math.round(state.speed * 3.6),
              agl: Math.round((state.y - terrainAt(state.x, state.z)) / exag),
              amsl: Math.round(state.y / exag),
              head: compass(state.yaw),
              deg: Math.round(headingDeg(state.yaw)),
              place: best?.name ?? "Toruń",
              dist: Math.round(bestD),
              throttle: state.throttle,
            });
          }
          renderer.render(scene, camera);
          raf = requestAnimationFrame(loop);
        };

        setReady(true);
        raf = requestAnimationFrame(loop);

        const onKeyDown = (e: KeyboardEvent) => {
          if (e.repeat) return;
          realKeys.add(e.code);
          if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
            e.preventDefault();
          }
          if (e.code === "Escape") {
            pausedRef.current = true;
            setPaused(true);
          }
        };
        const onKeyUp = (e: KeyboardEvent) => realKeys.delete(e.code);
        const clearKeys = () => realKeys.clear();
        const onMouse = (e: MouseEvent) => {
          if (document.pointerLockElement !== canvas && e.buttons !== 1) return;
          if (!playingRef.current || pausedRef.current) return;
          mouseDX += -e.movementX * 0.0031;
          mouseDY += -e.movementY * 0.0022;
        };
        const onLockClick = () => {
          if (!playingRef.current) return;
          canvas.requestPointerLock?.();
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", clearKeys);
        canvas.addEventListener("mousemove", onMouse);
        canvas.addEventListener("click", onLockClick);

        stop = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          window.removeEventListener("keydown", onKeyDown);
          window.removeEventListener("keyup", onKeyUp);
          window.removeEventListener("blur", clearKeys);
          canvas.removeEventListener("mousemove", onMouse);
          canvas.removeEventListener("click", onLockClick);
          scene.traverse((obj) => {
            const mesh = obj as import("three").Mesh;
            mesh.geometry?.dispose?.();
            const material = mesh.material as import("three").Material | import("three").Material[] | undefined;
            if (Array.isArray(material)) material.forEach((m) => m.dispose());
            else material?.dispose?.();
          });
          tex.dispose();
          renderer.dispose();
        };
      } catch (err) {
        if (!dead) setFail(err instanceof Error ? err.message : "Nie udało się wczytać terenu");
      }
    })();

    return () => {
      dead = true;
      stop();
      if (window.__controlsTest) delete window.__controlsTest;
    };
  }, []);

  function fly() {
    playingRef.current = true;
    pausedRef.current = false;
    setPlaying(true);
    setPaused(false);
    canvasRef.current?.requestPointerLock?.();
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-ink text-paper">
      <div ref={hostRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full touch-none" />
      </div>
      {fail ? (
        <p className="absolute inset-x-4 top-6 rounded-panel bg-panel px-4 py-3 text-sm text-ink">{fail}</p>
      ) : null}

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 md:p-4">
        <div className="pointer-events-auto rounded-panel bg-panel/95 px-3 py-2 text-ink">
          <p className="font-display text-xl leading-none">Nad Toruniem</p>
          <p className="mt-1 text-xs text-muted">Plan miasta, zdjęcia i teren</p>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            aria-pressed={night}
            onClick={() => {
              nightRef.current = !nightRef.current;
              setNight(nightRef.current);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-panel px-3 text-sm text-ink"
          >
            {night ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {night ? "Dzień" : "Noc"}
          </button>
          <button
            type="button"
            aria-pressed={wire}
            onClick={() => {
              wireRef.current = !wireRef.current;
              setWire(wireRef.current);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-panel px-3 text-sm text-ink"
          >
            <Grid3x3 className="size-4" />
            Siatka
          </button>
        </div>
      </header>

      {playing ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3 md:p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <dl className="grid grid-cols-3 gap-2 rounded-panel bg-panel/95 p-3 text-ink">
              <Stat icon={<Gauge className="size-4" />} label="Prędkość" value={`${hud.kmh} km/h`} />
              <Stat icon={<Mountain className="size-4" />} label="Nad ziemią" value={`${hud.agl} m`} />
              <Stat icon={<Compass className="size-4" />} label="Kurs" value={`${hud.head} ${hud.deg}°`} />
            </dl>
            <p className="rounded-panel bg-panel/95 px-3 py-2 text-sm text-ink">
              {hud.place}
              <span className="text-muted"> · {hud.dist} m</span>
              <span className="mt-1 block text-xs text-muted">
                gaz {Math.round(hud.throttle * 100)}% · AMSL {hud.amsl} m
              </span>
            </p>
          </div>
          <p className="px-1 text-xs text-paper">Esri · budynki OpenStreetMap · zdjęcia Wikimedia Commons · teren AWS</p>
        </div>
      ) : null}

      {touch && playing && !paused ? (
        <div className="absolute inset-x-0 bottom-28 flex items-end justify-between px-4">
          <Stick
            x={stick.x}
            y={stick.y}
            on={stick.on}
            onChange={(next) => {
              stickRef.current = { x: next.x, y: next.y };
              setStick({ ...next, on: true });
            }}
            onEnd={() => {
              stickRef.current = { x: 0, y: 0 };
              setStick({ x: 0, y: 0, on: false });
            }}
          />
          <div className="flex flex-col gap-2">
            <Hold label="Gaz" onDown={() => (gasRef.current = 1)} onUp={() => (gasRef.current = 0)} />
            <Hold label="Zdejmij" onDown={() => (gasRef.current = -1)} onUp={() => (gasRef.current = 0)} />
          </div>
        </div>
      ) : null}

      {!playing || paused ? (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/35 p-4">
          <div className="w-full max-w-md rounded-panel bg-panel p-5 text-ink">
            <p className="font-display text-3xl leading-none">Nad Toruniem</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {paused
                ? "Pauza. Sterowanie zostaje tam, gdzie puściłeś drążek."
                : "Prawdziwe obrysy z mapy miasta stoją na zdjęciu lotniczym. Dachy i ściany biorą kolor z tej fotografii co kilka metrów, a nad zabytkami i ulicami wiszą geotagowane zdjęcia."}
            </p>
            {stats.buildings > 0 ? (
              <p className="mt-2 text-sm text-ink">
                {stats.buildings.toLocaleString("pl-PL")} budynków
                {stats.photos > 0 ? ` · ${stats.photos} zdjęć` : ""}
              </p>
            ) : null}
            <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <li className="rounded-xl bg-paper px-3 py-2"><b>W / S</b> gaz</li>
              <li className="rounded-xl bg-paper px-3 py-2"><b>A / D</b> zakręt</li>
              <li className="rounded-xl bg-paper px-3 py-2"><b>Mysz</b> nos i przechył</li>
              <li className="rounded-xl bg-paper px-3 py-2"><b>↑ / ↓</b> pochylenie</li>
            </ul>
            <button
              type="button"
              disabled={!ready && !fail}
              onClick={fly}
              className="mt-4 min-h-12 w-full rounded-full bg-brick px-4 text-paper disabled:opacity-60"
            >
              {ready ? (paused ? "Dalej" : "Wleć") : "Składam miasto…"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-16">
      <dt className="flex items-center gap-1 text-xs text-muted">
        {icon}
        {label}
      </dt>
      <dd className="font-display text-lg leading-tight">{value}</dd>
    </div>
  );
}

function Hold({ label, onDown, onUp }: { label: string; onDown: () => void; onUp: () => void }) {
  return (
    <button
      type="button"
      className="min-h-14 min-w-24 rounded-full bg-panel px-4 text-sm text-ink"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {label}
    </button>
  );
}

function Stick({
  x,
  y,
  on,
  onChange,
  onEnd,
}: {
  x: number;
  y: number;
  on: boolean;
  onChange: (v: { x: number; y: number }) => void;
  onEnd: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  function move(clientX: number, clientY: number) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = -((clientY - (r.top + r.height / 2)) / (r.height / 2));
    onChange({ x: clamp(dx, -1, 1), y: clamp(dy, -1, 1) });
  }
  return (
    <div
      ref={ref}
      className="relative size-28 rounded-full border border-line bg-panel/90"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e.clientX, e.clientY);
      }}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
    >
      <span
        className="absolute size-10 rounded-full bg-brick"
        style={{
          left: `calc(50% + ${x * 36}px - 1.25rem)`,
          top: `calc(50% - ${y * 36}px - 1.25rem)`,
          opacity: on ? 1 : 0.85,
        }}
      />
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Brak mapy wysokości"));
    img.src = src;
  });
}

function readElev(img: HTMLImageElement, meta: Meta): Float32Array {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  const out = new Float32Array(img.width * img.height);
  const span = meta.maxH - meta.minH;
  for (let i = 0; i < out.length; i++) out[i] = meta.minH + (data[i * 4] / 255) * span;
  return out;
}

function bilinear(grid: Float32Array, size: number, u: number, v: number): number {
  const x = u * (size - 1);
  const y = v * (size - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const i = (yy: number, xx: number) => grid[yy * size + xx] ?? 0;
  const a = i(y0, x0) * (1 - tx) + i(y0, x1) * tx;
  const b = i(y1, x0) * (1 - tx) + i(y1, x1) * tx;
  return a * (1 - ty) + b * ty;
}

function buildCraft(THREE: typeof import("three")) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: "#1c1915", roughness: 0.6, metalness: 0.05 });
  const wingMat = new THREE.MeshStandardMaterial({ color: "#f4efe4", roughness: 0.7, metalness: 0 });
  const accent = new THREE.MeshStandardMaterial({ color: "#b5523a", roughness: 0.55, metalness: 0 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 3.4), bodyMat);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.7), accent);
  nose.position.set(0, 0, -1.9);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.07, 0.85), wingMat);
  wing.position.set(0, 0.05, -0.15);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 0.42), wingMat);
  tail.position.set(0, 0.08, 1.45);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.7, 0.48), accent);
  fin.position.set(0, 0.42, 1.45);
  g.add(body, nose, wing, tail, fin);
  g.scale.setScalar(2.4);
  return g;
}
