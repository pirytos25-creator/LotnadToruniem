import { useEffect, useRef, useState } from "react";
import { Compass, Gauge, Grid3x3, Moon, Mountain, Sun } from "lucide-react";
import { buildWorld, type WorldApi } from "@/game/buildWorld";
import {
  CLEARANCE,
  lookToward,
  radialDeadzone,
  readActions,
  speedOf,
  stepFlight,
  type FlightState,
  type PadSnap,
} from "@/game/sim";
import { MAP, WATER_Y, headingFromYaw, nearestPlace, sampleSurface } from "@/game/world";

type Hud = {
  agl: number;
  river: number;
  kmh: number;
  deg: number;
  head: string;
  place: string;
  dist: number;
  grounded: boolean;
};

const HERO_FROM = { x: 36, y: 118, z: 540 };
const HERO_LOOK = lookToward(HERO_FROM, { x: -8, y: 40, z: 58 });
const PREF_KEY = "nad-toruniem-v1";
const SENS = 0.00235;
const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "KeyQ",
  "KeyE",
  "KeyC",
  "KeyG",
  "KeyN",
]);

function loadPref(): { night: boolean; wire: boolean } {
  try {
    if (typeof localStorage === "undefined") return { night: false, wire: false };
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return { night: false, wire: false };
    const p = JSON.parse(raw) as { night?: boolean; wire?: boolean };
    return { night: !!p.night, wire: !!p.wire };
  } catch {
    return { night: false, wire: false };
  }
}

function lockPointer(el: HTMLElement | null) {
  if (!el) return;
  try {
    const pending = el.requestPointerLock() as void | Promise<unknown>;
    if (pending && typeof (pending as Promise<unknown>).then === "function") {
      void (pending as Promise<unknown>).catch(() => {});
    }
  } catch {
    /* The preview frame may refuse the lock; drag-look still works. */
  }
}

function emptyHud(): Hud {
  return { agl: 0, river: 0, kmh: 0, deg: 0, head: "N", place: "Toruń", dist: 0, grounded: false };
}

export function Flyover() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [locked, setLocked] = useState(false);
  const [night, setNight] = useState(false);
  const [wire, setWire] = useState(false);
  const [booted, setBooted] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>(emptyHud);
  const [touchUi, setTouchUi] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0, on: false });
  const [liftUp, setLiftUp] = useState(false);
  const [liftDown, setLiftDown] = useState(false);

  const playingRef = useRef(false);
  const pausedRef = useRef(false);
  const stickRef = useRef({ x: 0, y: 0 });
  const liftRef = useRef(0);
  const apiRef = useRef({ toggleNight: () => {}, toggleWire: () => {} });

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse), (max-width: 767px)");
    const sync = () => setTouchUi(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    let world: WorldApi | null = null;
    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full";
    host.prepend(canvas);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saved = loadPref();
    const state: FlightState = {
      x: HERO_FROM.x,
      y: HERO_FROM.y,
      z: HERO_FROM.z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: HERO_LOOK.yaw,
      pitch: HERO_LOOK.pitch,
    };
    const realKeys = new Set<string>();
    let injected: Set<string> | null = null;
    const prev = new Set<string>();
    let lookX = 0;
    let lookY = 0;
    let dragging: number | null = null;
    let lastPx = 0;
    let lastPy = 0;
    let hadLock = false;
    let nightNow = saved.night ? 1 : 0;
    let nightTarget = nightNow;
    let wireOn = saved.wire;
    let hudAcc = 0;
    let grounded = false;

    const save = () => {
      localStorage.setItem(PREF_KEY, JSON.stringify({ night: nightTarget > 0.5, wire: wireOn }));
    };

    const resize = () => {
      if (!world) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w < 2 || h < 2) return;
      const mobile = w < 800;
      world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6));
      world.renderer.setSize(w, h, false);
      world.camera.aspect = w / h;
      world.camera.updateProjectionMatrix();
    };

    try {
      world = buildWorld(canvas);
    } catch (err) {
      setFail(err instanceof Error ? err.message : "Nie udało się otworzyć widoku 3D.");
      canvas.remove();
      return;
    }
    if (dead) {
      world.dispose();
      canvas.remove();
      return;
    }

    world.setWire(wireOn);
    world.applyNight(nightNow);
    setNight(saved.night);
    setWire(saved.wire);
    resize();

    const publish = () => {
      const surface = sampleSurface(state.x, state.z);
      const agl = Math.max(0, state.y - surface - CLEARANCE);
      const head = headingFromYaw(state.yaw);
      const near = nearestPlace(state.x, state.z);
      setHud({
        agl,
        river: state.y - WATER_Y,
        kmh: speedOf(state) * 3.6,
        deg: head.deg,
        head: head.label,
        place: near.place.name,
        dist: near.dist,
        grounded,
      });
    };

    apiRef.current.toggleNight = () => {
      nightTarget = nightTarget > 0.5 ? 0 : 1;
      setNight(nightTarget > 0.5);
      save();
    };
    apiRef.current.toggleWire = () => {
      wireOn = !wireOn;
      world?.setWire(wireOn);
      setWire(wireOn);
      save();
    };

    const resetPose = () => {
      state.x = 0;
      state.y = 120;
      state.z = 280;
      state.vx = 0;
      state.vy = 0;
      state.vz = 0;
      state.yaw = 0;
      state.pitch = 0;
      playingRef.current = true;
      pausedRef.current = false;
      setPlaying(true);
      setPaused(false);
    };

    const probe = {
      getYaw: () => state.yaw,
      getSpeed: () => speedOf(state),
      getPos: () => ({ x: state.x, y: state.y, z: state.z }),
      setKeys: (codes: string[]) => {
        injected = new Set(codes);
        playingRef.current = true;
        pausedRef.current = false;
        setPlaying(true);
        setPaused(false);
      },
      nudgeY: (y: number) => {
        state.y = y;
        state.vy = -25;
      },
      resetPose,
    };
    (window as unknown as { __controlsTest: typeof probe }).__controlsTest = probe;

    const onKeyDown = (e: KeyboardEvent) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      realKeys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      realKeys.delete(e.code);
    };
    const clearKeys = () => realKeys.clear();

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-ui]")) return;
      if (!playingRef.current || pausedRef.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.pointerType === "mouse" && playingRef.current && !pausedRef.current) {
        if (document.pointerLockElement !== host) lockPointer(host);
      }
      dragging = e.pointerId;
      lastPx = e.clientX;
      lastPy = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (document.pointerLockElement === host) {
        lookX += e.movementX * SENS;
        lookY += e.movementY * SENS;
        return;
      }
      if (dragging !== e.pointerId) return;
      lookX += (e.clientX - lastPx) * SENS;
      lookY += (e.clientY - lastPy) * SENS;
      lastPx = e.clientX;
      lastPy = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (dragging === e.pointerId) dragging = null;
    };

    const onLock = () => {
      if (document.pointerLockElement === host) {
        hadLock = true;
        setLocked(true);
      } else {
        setLocked(false);
        if (hadLock && playingRef.current) {
          hadLock = false;
          pausedRef.current = true;
          setPaused(true);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", clearKeys);
    host.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("pointerlockchange", onLock);
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const pollPad = (): PadSnap => {
      const list = navigator.getGamepads?.();
      const gp = list ? list[0] : null;
      if (!gp) return null;
      const left = radialDeadzone(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
      const right = radialDeadzone(gp.axes[2] ?? 0, gp.axes[3] ?? 0);
      return {
        lx: left.x,
        ly: left.y,
        rx: right.x,
        ry: right.y,
        up: gp.buttons[7]?.value ?? 0,
        down: gp.buttons[6]?.value ?? 0,
      };
    };

    let last = performance.now();
    world.renderer.setAnimationLoop((now) => {
      if (!world) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const held = injected ?? realKeys;

      if (playingRef.current && !pausedRef.current) {
        if (held.has("KeyG") && !prev.has("KeyG")) apiRef.current.toggleWire();
        if (held.has("KeyN") && !prev.has("KeyN")) apiRef.current.toggleNight();
        const actions = readActions(held, lookX, lookY, stickRef.current.x, stickRef.current.y, pollPad(), dt);
        actions.lift = Math.max(-1, Math.min(1, actions.lift + liftRef.current));
        grounded = stepFlight(state, actions, dt, sampleSurface, world.colliders, MAP * 0.5 - 40);
      }
      lookX = 0;
      lookY = 0;
      prev.clear();
      for (const code of held) prev.add(code);

      const blend = reduced ? 1 : 1 - Math.exp(-4 * dt);
      nightNow += (nightTarget - nightNow) * blend;
      world.applyNight(nightNow);

      const cam = world.camera;
      cam.position.set(state.x, state.y, state.z);
      cam.rotation.order = "YXZ";
      cam.rotation.y = state.yaw;
      cam.rotation.x = state.pitch;
      cam.rotation.z = 0;
      world.tick(dt, cam.position, reduced);
      world.renderer.render(world.scene, cam);

      hudAcc += dt;
      if (hudAcc > 0.12) {
        hudAcc = 0;
        publish();
      }
    });

    publish();
    setBooted(true);
    document.documentElement.dataset.flight = "ready";

    return () => {
      dead = true;
      world?.renderer.setAnimationLoop(null);
      world?.dispose();
      ro.disconnect();
      canvas.remove();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", clearKeys);
      host.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("pointerlockchange", onLock);
      if (document.pointerLockElement === host) document.exitPointerLock();
      delete window.__controlsTest;
      delete document.documentElement.dataset.flight;
    };
  }, []);

  const begin = () => {
    playingRef.current = true;
    pausedRef.current = false;
    setPlaying(true);
    setPaused(false);
    lockPointer(hostRef.current);
  };

  const resume = () => {
    pausedRef.current = false;
    setPaused(false);
    lockPointer(hostRef.current);
  };

  return (
    <div className="relative h-dvh w-full select-none bg-night text-ink">
      <div ref={hostRef} className="absolute inset-0 touch-none" />

      {fail && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
          <p className="max-w-md rounded-panel bg-panel p-6 text-center">{fail}</p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0">
        {!playing && !fail && (
          <div className="absolute inset-0 p-4 md:p-6">
            <section
              data-ui
              className="pointer-events-auto max-h-full w-full max-w-md overflow-y-auto rounded-panel border border-line bg-panel p-5 shadow-sm md:p-6"
            >
              <p className="text-xs font-semibold tracking-widest text-river">PRZELOT</p>
              <h1 className="mt-1 font-display text-3xl font-semibold italic leading-tight text-ink md:text-4xl">
                Nad Toruniem
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Ceglane Stare Miasto i Wisła z niskich wielokątów. Mysz rozgląda, klawiatura niesie.
                Barwa terenu rośnie z wysokością.
              </p>
              <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <li className="rounded-lg border border-line bg-paper px-3 py-2">
                  <span className="font-semibold text-ink">Mysz</span>
                  <span className="mt-0.5 block text-muted">rozglądanie, także przeciąganie</span>
                </li>
                <li className="rounded-lg border border-line bg-paper px-3 py-2">
                  <span className="font-semibold text-ink">
                    <kbd className="kbd">W</kbd> <kbd className="kbd">S</kbd>
                  </span>
                  <span className="mt-0.5 block text-muted">naprzód i wstecz wzdłuż spojrzenia</span>
                </li>
                <li className="rounded-lg border border-line bg-paper px-3 py-2">
                  <span className="font-semibold text-ink">
                    <kbd className="kbd">A</kbd> <kbd className="kbd">D</kbd>
                  </span>
                  <span className="mt-0.5 block text-muted">w lewo i w prawo względem widoku</span>
                </li>
                <li className="rounded-lg border border-line bg-paper px-3 py-2">
                  <span className="font-semibold text-ink">
                    <kbd className="kbd">Spacja</kbd> <kbd className="kbd">Shift</kbd>
                  </span>
                  <span className="mt-0.5 block text-muted">wyżej i niżej, Q też w dół</span>
                </li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <i className="size-3 rounded-sm bg-river" /> koryto
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="size-3 rounded-sm bg-sand" /> brzeg
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="size-3 rounded-sm bg-meadow" /> łąka
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="size-3 rounded-sm bg-brick" /> cegła
                </span>
              </div>
              <p className="mt-3 hidden text-xs leading-relaxed text-muted sm:block">
                Stylizowana makieta, nie mapa geodezyjna. <kbd className="kbd">G</kbd> siatka,{" "}
                <kbd className="kbd">N</kbd> dzień i noc. Grunt zatrzymuje zniżanie.
              </p>
              <button
                type="button"
                data-ui
                disabled={!booted}
                onClick={begin}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brick px-5 font-semibold text-paper transition-colors duration-200 hover:bg-brick-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50 motion-reduce:transition-none"
              >
                {booted ? "Wleć" : "Składam teren…"}
              </button>
            </section>
          </div>
        )}

        {playing && paused && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <section
              data-ui
              className="pointer-events-auto w-full max-w-sm rounded-panel border border-line bg-panel p-5 text-center shadow-sm"
            >
              <h2 className="font-display text-3xl italic text-ink">Pauza</h2>
              <p className="mt-2 text-sm text-muted">Kursor puszczony. Świat stoi w miejscu.</p>
              <button
                type="button"
                data-ui
                onClick={resume}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brick px-5 font-semibold text-paper hover:bg-brick-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                Kontynuuj
              </button>
            </section>
          </div>
        )}

        {playing && !paused && (
          <>
            <div className="pointer-events-none absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brick" />
            <div className="absolute inset-x-0 top-0 flex justify-end p-4">
              <div data-ui className="pointer-events-auto flex gap-2">
                <button
                  type="button"
                  aria-pressed={night}
                  onClick={() => apiRef.current.toggleNight()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-panel px-4 text-sm font-semibold text-ink hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brick"
                >
                  {night ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
                  {night ? "Dzień" : "Noc"}
                </button>
                <button
                  type="button"
                  aria-pressed={wire}
                  onClick={() => apiRef.current.toggleWire()}
                  className={
                    "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brick " +
                    (wire
                      ? "border-ink bg-ink text-paper"
                      : "border-line bg-panel text-ink hover:bg-paper")
                  }
                >
                  <Grid3x3 className="size-4" aria-hidden />
                  Siatka
                </button>
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
              {touchUi && (
                <div
                  data-ui
                  className="pointer-events-auto relative size-28 shrink-0 rounded-full border border-line bg-panel/90"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ox = rect.left + rect.width / 2;
                    const oy = rect.top + rect.height / 2;
                    const apply = (cx: number, cy: number) => {
                      const dz = radialDeadzone((cx - ox) / 46, (cy - oy) / 46, 0.2);
                      const x = Math.max(-1, Math.min(1, dz.x));
                      const y = Math.max(-1, Math.min(1, -dz.y));
                      stickRef.current = { x, y };
                      setKnob({ x, y, on: true });
                    };
                    apply(e.clientX, e.clientY);
                    const move = (ev: PointerEvent) => {
                      if (ev.pointerId !== e.pointerId) return;
                      apply(ev.clientX, ev.clientY);
                    };
                    const up = (ev: PointerEvent) => {
                      if (ev.pointerId !== e.pointerId) return;
                      stickRef.current = { x: 0, y: 0 };
                      setKnob({ x: 0, y: 0, on: false });
                      window.removeEventListener("pointermove", move);
                      window.removeEventListener("pointerup", up);
                      window.removeEventListener("pointercancel", up);
                    };
                    window.addEventListener("pointermove", move);
                    window.addEventListener("pointerup", up);
                    window.addEventListener("pointercancel", up);
                  }}
                  role="application"
                  aria-label="Napęd"
                >
                  <span
                    className="absolute left-1/2 top-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brick"
                    style={{
                      transform: `translate(calc(-50% + ${knob.x * 28}px), calc(-50% + ${-knob.y * 28}px))`,
                    }}
                  />
                </div>
              )}

              <section className="pointer-events-none min-w-0 flex-1 rounded-panel border border-line bg-panel/95 px-4 py-3 shadow-sm sm:max-w-sm sm:flex-none">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted">
                      <Mountain className="size-3.5" aria-hidden /> Nad gruntem
                    </p>
                    <p className="font-display text-3xl leading-none tabular-nums text-ink sm:text-4xl">
                      {Math.round(hud.agl)}
                      <span className="ml-1 text-base font-sans font-semibold text-muted">m</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="flex items-center justify-end gap-1 text-xs font-semibold tracking-wide text-muted">
                      <Gauge className="size-3.5" aria-hidden /> Prędkość
                    </p>
                    <p className="font-display text-3xl leading-none tabular-nums text-brick sm:text-4xl">
                      {Math.round(hud.kmh)}
                      <span className="ml-1 text-base font-sans font-semibold text-muted">km/h</span>
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
                  <span className="tabular-nums">n.p. Wisły {Math.round(hud.river)} m</span>
                  <span className="inline-flex items-center gap-1 tabular-nums text-ink">
                    <Compass className="size-3.5 text-river" aria-hidden />
                    {Math.round(hud.deg).toString().padStart(3, "0")}° {hud.head}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-ink">
                  {hud.place}
                  <span className="text-muted"> · {Math.round(hud.dist)} m</span>
                  {hud.grounded && <span className="text-meadow"> · przy gruncie</span>}
                </p>
                {!touchUi && (
                  <p className="mt-2 hidden text-xs text-muted md:block">
                    {locked ? "Esc puszcza mysz" : "Kliknij scenę, by złapać kursor"} · WASD napęd
                  </p>
                )}
              </section>

              {touchUi && (
                <div data-ui className="pointer-events-auto flex shrink-0 flex-col gap-2">
                  <button
                    type="button"
                    aria-label="Wyżej"
                    className={
                      "inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border border-line px-3 text-sm font-semibold " +
                      (liftUp ? "bg-brick text-paper" : "bg-panel text-ink")
                    }
                    onPointerDown={(e) => {
                      e.preventDefault();
                      liftRef.current = 1;
                      setLiftUp(true);
                    }}
                    onPointerUp={() => {
                      liftRef.current = 0;
                      setLiftUp(false);
                    }}
                    onPointerCancel={() => {
                      liftRef.current = 0;
                      setLiftUp(false);
                    }}
                    onPointerLeave={() => {
                      if (liftRef.current === 1) {
                        liftRef.current = 0;
                        setLiftUp(false);
                      }
                    }}
                  >
                    Wyżej
                  </button>
                  <button
                    type="button"
                    aria-label="Niżej"
                    className={
                      "inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border border-line px-3 text-sm font-semibold " +
                      (liftDown ? "bg-ink text-paper" : "bg-panel text-ink")
                    }
                    onPointerDown={(e) => {
                      e.preventDefault();
                      liftRef.current = -1;
                      setLiftDown(true);
                    }}
                    onPointerUp={() => {
                      liftRef.current = 0;
                      setLiftDown(false);
                    }}
                    onPointerCancel={() => {
                      liftRef.current = 0;
                      setLiftDown(false);
                    }}
                    onPointerLeave={() => {
                      if (liftRef.current === -1) {
                        liftRef.current = 0;
                        setLiftDown(false);
                      }
                    }}
                  >
                    Niżej
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
