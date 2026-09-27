import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Map as MapIcon,
  Maximize2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { CityMap } from "@/components/CityMap";
import {
  FILTERS,
  PLACES,
  PLACE_BY_ID,
  ROUTES,
  formatLeg,
  normalize,
  pathMeters,
  shotCount,
  type Place,
} from "@/data/atlas";

type Tab = "foto" | "mapa" | "lista";

const PLAN_KEY = "nad-toruniem-plan";
const NO_LINE: string[] = [];

function loadPlan(): string[] {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw) as unknown;
    if (!Array.isArray(ids)) return [];
    return ids.filter((id): id is string => typeof id === "string" && id in PLACE_BY_ID);
  } catch {
    return [];
  }
}

export function Atlas() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("wszystkie");
  const [routeId, setRouteId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("ratusz");
  const [shot, setShot] = useState(0);
  const [tab, setTab] = useState<Tab>("foto");
  const [plan, setPlan] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState(false);
  const [planReady, setPlanReady] = useState(false);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    setPlan(loadPlan());
    setPlanReady(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!planReady) return;
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  }, [plan, planReady]);

  const place = PLACE_BY_ID[selectedId] ?? PLACES[0];
  const activeShot = place.shots[Math.min(shot, place.shots.length - 1)];

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return PLACES.filter((item) => {
      if (filter !== "wszystkie" && !item.tags.includes(filter)) return false;
      if (!q) return true;
      const hay = normalize(
        [item.name, item.address, item.about, item.stand, ...item.shots.map((s) => s.caption)].join(
          " ",
        ),
      );
      return hay.includes(q);
    });
  }, [query, filter]);

  const activeRoute = ROUTES.find((route) => route.id === routeId) ?? null;
  const lineIds = useMemo(() => {
    if (activeRoute) return activeRoute.placeIds;
    if (plan.length > 1) return plan;
    return NO_LINE;
  }, [activeRoute, plan]);
  const lineKind = activeRoute ? "route" : plan.length > 1 ? "plan" : null;
  const mapVisible = wide || tab === "mapa";

  function selectPlace(id: string, nextTab?: Tab) {
    setSelectedId(id);
    setShot(0);
    if (nextTab) setTab(nextTab);
  }

  function toggleRoute(id: string) {
    if (routeId === id) {
      setRouteId(null);
      return;
    }
    const route = ROUTES.find((item) => item.id === id);
    if (!route) return;
    setRouteId(id);
    selectPlace(route.placeIds[0]);
  }

  function togglePlan(id: string) {
    setPlan((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "Escape") {
        setLightbox(false);
        return;
      }
      if (event.key === "ArrowRight") {
        setShot((index) => Math.min(place.shots.length - 1, index + 1));
      }
      if (event.key === "ArrowLeft") {
        setShot((index) => Math.max(0, index - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [place.shots.length]);

  const inPlan = plan.includes(place.id);
  const legIndex = lineIds.indexOf(place.id);
  const leg =
    legIndex > 0
      ? formatLeg(pathMeters([lineIds[legIndex - 1], lineIds[legIndex]]))
      : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper text-ink">
      <header className="flex shrink-0 flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-end md:gap-6">
        <div className="min-w-0">
          <p className="font-display text-2xl leading-none text-ink">Nad Toruniem</p>
          <p className="mt-1 text-sm text-muted">
            {PLACES.length} miejsc, {shotCount()} zdjęć z Wikimedia Commons. Mapa OpenStreetMap, nie makieta.
          </p>
        </div>
        <label className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-panel px-3 md:ml-auto md:w-80">
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szukaj: brama, Kopernik, 1928…"
            aria-label="Szukaj miejsca"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </label>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`flex w-full min-h-0 flex-col border-line md:w-96 md:shrink-0 md:border-r ${
            tab === "lista" ? "flex" : "max-md:hidden"
          }`}
        >
          <div className="flex gap-2 overflow-x-auto px-3 py-3">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={`shrink-0 rounded-full px-3 py-2 text-sm ${
                  filter === item.id ? "bg-ink text-paper" : "bg-panel text-ink"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 px-3 pb-3">
            {ROUTES.map((route) => {
              const on = route.id === routeId;
              return (
                <button
                  key={route.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleRoute(route.id)}
                  className={`rounded-panel border px-3 py-2 text-left ${
                    on ? "border-river bg-panel" : "border-line bg-paper"
                  }`}
                >
                  <span className="block text-sm font-medium text-ink">{route.name}</span>
                  <span className="mt-1 block text-xs text-muted">{formatLeg(pathMeters(route.placeIds))}</span>
                </button>
              );
            })}
          </div>

          <p className="px-4 pb-2 text-xs text-muted">
            Linia na mapie łączy miejsca na wprost. To kolejność, nie ślad chodnika.
            {plan.length > 0 ? ` Plan: ${plan.length}.` : ""}
          </p>

          <ul className="min-h-0 flex-1 overflow-y-auto border-t border-line">
            {filtered.length === 0 ? (
              <li className="px-4 py-8 text-sm text-muted">Nic nie pasuje do „{query.trim()}”.</li>
            ) : (
              filtered.map((item) => (
                <li key={item.id}>
                  <PlaceRow
                    place={item}
                    selected={item.id === place.id}
                    onSelect={() => selectPlace(item.id, "foto")}
                  />
                </li>
              ))
            )}
          </ul>
        </aside>

        <section
          className={`grid min-h-0 min-w-0 flex-1 grid-rows-1 md:grid-rows-2 ${
            tab === "lista" ? "max-md:hidden" : ""
          }`}
        >
          <div className={`min-h-0 ${tab === "foto" ? "" : "max-md:hidden"}`}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="relative min-h-40 flex-1 bg-ink">
                <img
                  src={activeShot.src}
                  alt={activeShot.alt}
                  className="h-full w-full object-contain"
                />
                {place.shots.length > 1 ? (
                  <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
                    {place.shots.map((item, index) => (
                      <button
                        key={item.src}
                        type="button"
                        aria-pressed={index === shot}
                        onClick={() => setShot(index)}
                        className={`rounded-full px-3 py-2 text-xs ${
                          index === shot ? "bg-paper text-ink" : "bg-ink text-paper"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="absolute right-3 top-3 flex gap-2">
                  {place.shots.length > 1 ? (
                    <>
                      <button
                        type="button"
                        aria-label="Poprzednie zdjęcie"
                        onClick={() => setShot((index) => Math.max(0, index - 1))}
                        className="grid size-11 place-items-center rounded-full bg-paper text-ink"
                      >
                        <ChevronLeft className="size-5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Następne zdjęcie"
                        onClick={() => setShot((index) => Math.min(place.shots.length - 1, index + 1))}
                        className="grid size-11 place-items-center rounded-full bg-paper text-ink"
                      >
                        <ChevronRight className="size-5" />
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Powiększ zdjęcie"
                    onClick={() => setLightbox(true)}
                    className="grid size-11 place-items-center rounded-full bg-paper text-ink"
                  >
                    <Maximize2 className="size-5" />
                  </button>
                </div>
              </div>

              <div className="max-h-1/2 overflow-y-auto border-t border-line bg-panel px-4 py-4 text-ink">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="font-display text-3xl leading-none">{place.name}</h1>
                    <p className="mt-1 text-sm text-muted">{place.address}</p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={inPlan}
                    onClick={() => togglePlan(place.id)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm ${
                      inPlan ? "bg-brick text-paper" : "bg-ink text-paper"
                    }`}
                  >
                    {inPlan ? <Check className="size-4" /> : <Plus className="size-4" />}
                    {inPlan ? "W planie" : "Do planu"}
                  </button>
                </div>
                <p className="mt-3 text-sm leading-relaxed">{activeShot.caption}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{place.stand}</p>
                <p className="mt-2 text-sm leading-relaxed">{place.about}</p>
                {leg ? <p className="mt-2 text-sm text-river">Od poprzedniego punktu: {leg}</p> : null}
                {place.related.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {place.related.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => selectPlace(id)}
                        className="rounded-full border border-line bg-paper px-3 py-2 text-xs text-ink"
                      >
                        {PLACE_BY_ID[id]?.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="mt-3 text-xs text-muted">
                  {activeShot.credit} · {activeShot.license} ·{" "}
                  <a
                    href={activeShot.commons}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-line underline-offset-2"
                  >
                    plik na Commons
                  </a>
                </p>
              </div>
            </div>
          </div>

          <div className={`relative min-h-0 ${tab === "mapa" ? "" : "max-md:hidden"}`}>
            <CityMap
              places={PLACES}
              selectedId={place.id}
              lineIds={lineIds}
              lineKind={lineKind}
              visible={mapVisible}
              onSelect={(id) => selectPlace(id)}
            />
            <button
              type="button"
              onClick={() => setTab("foto")}
              className="absolute bottom-3 left-3 right-16 z-10 flex items-center gap-3 rounded-panel border border-line bg-panel p-2 text-left md:hidden"
            >
              <img src={place.shots[0].src} alt="" className="h-12 w-16 rounded-md object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{place.name}</span>
                <span className="block text-xs text-muted">Zobacz zdjęcie</span>
              </span>
            </button>
          </div>
        </section>
      </div>

      <nav className="grid shrink-0 grid-cols-3 border-t border-line bg-panel md:hidden">
        <TabButton current={tab} id="foto" label="Zdjęcie" icon={<Camera className="size-4" />} onSelect={setTab} />
        <TabButton current={tab} id="mapa" label="Mapa" icon={<MapIcon className="size-4" />} onSelect={setTab} />
        <TabButton current={tab} id="lista" label="Lista" icon={<Search className="size-4" />} onSelect={setTab} />
      </nav>

      {lightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={place.name}
          className="fixed inset-0 z-50 flex flex-col bg-ink text-paper"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="min-w-0 truncate font-display text-xl">{place.name}</p>
            <button
              type="button"
              aria-label="Zamknij"
              onClick={() => setLightbox(false)}
              className="grid size-11 place-items-center rounded-full bg-paper text-ink"
            >
              <X className="size-5" />
            </button>
          </div>
          <img src={activeShot.src} alt={activeShot.alt} className="min-h-0 flex-1 object-contain" />
          <p className="px-4 py-3 text-sm text-paper">
            {activeShot.caption} {activeShot.credit}, {activeShot.license}.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PlaceRow({
  place,
  selected,
  onSelect,
}: {
  place: Place;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left ${
        selected ? "bg-panel" : "bg-paper"
      }`}
    >
      <img src={place.shots[0].src} alt="" className="h-14 w-20 shrink-0 object-cover" />
      <span className="min-w-0">
        <span className={`block truncate text-sm ${selected ? "font-medium" : ""}`}>{place.name}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {place.shots.length > 1 ? `${place.shots.length} zdjęcia · ` : ""}
          {place.address}
        </span>
      </span>
    </button>
  );
}

function TabButton({
  current,
  id,
  label,
  icon,
  onSelect,
}: {
  current: Tab;
  id: Tab;
  label: string;
  icon: ReactNode;
  onSelect: (id: Tab) => void;
}) {
  const on = current === id;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onSelect(id)}
      className={`flex min-h-12 flex-col items-center justify-center gap-1 text-xs ${
        on ? "text-brick" : "text-muted"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
