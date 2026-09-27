import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Polyline } from "leaflet";
import "leaflet/dist/leaflet.css";
import { PLACE_BY_ID, type Place } from "@/data/atlas";

type Props = {
  places: Place[];
  selectedId: string;
  lineIds: string[];
  lineKind: "route" | "plan" | null;
  visible: boolean;
  onSelect: (id: string) => void;
};

function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function CityMap({ places, selectedId, lineIds, lineKind, visible, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const lineRef = useRef<Polyline | null>(null);
  const onSelectRef = useRef(onSelect);
  const lineKeyRef = useRef("");
  const [ready, setReady] = useState(false);
  onSelectRef.current = onSelect;

  const lineKey = lineIds.join(",");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    let map: LeafletMap | null = null;

    void (async () => {
      const mod = await import("leaflet");
      const L = (mod.default ?? mod) as typeof import("leaflet");
      if (dead || !hostRef.current) return;

      map = L.map(hostRef.current, {
        zoomControl: false,
        minZoom: 12,
        maxZoom: 19,
        scrollWheelZoom: true,
      }).setView([53.0094, 18.6055], 15);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      map.setMaxBounds(L.latLngBounds([52.97, 18.52], [53.06, 18.72]));

      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
        detectRetina: true,
      }).addTo(map);

      for (const place of places) {
        const marker = L.marker([place.lat, place.lng], {
          icon: L.divIcon({
            className: "nt-pin",
            html: "",
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          title: place.name,
          keyboard: true,
        });
        marker.on("click", () => onSelectRef.current(place.id));
        marker.addTo(map);
        markersRef.current.set(place.id, marker);
      }

      mapRef.current = map;
      setReady(true);
      requestAnimationFrame(() => map?.invalidateSize());
    })();

    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize();
    });
    observer.observe(host);

    return () => {
      dead = true;
      observer.disconnect();
      lineRef.current = null;
      markersRef.current.clear();
      map?.remove();
      mapRef.current = null;
    };
  }, [places]);

  useEffect(() => {
    if (!visible || !ready) return;
    const map = mapRef.current;
    if (!map) return;
    const id = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(id);
  }, [visible, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let dead = false;

    void (async () => {
      const mod = await import("leaflet");
      const L = (mod.default ?? mod) as typeof import("leaflet");
      if (dead || mapRef.current !== map) return;

      const onLine = new Set(lineIds);
      for (const [id, marker] of markersRef.current) {
        const el = marker.getElement();
        if (!el) continue;
        const index = lineIds.indexOf(id);
        el.textContent = index >= 0 ? String(index + 1) : "";
        el.classList.toggle("is-sel", id === selectedId);
        el.classList.toggle("is-on", index >= 0);
        el.classList.toggle("is-dim", lineIds.length > 0 && !onLine.has(id));
      }

      const lineChanged = lineKeyRef.current !== lineKey;
      lineKeyRef.current = lineKey;

      lineRef.current?.remove();
      lineRef.current = null;
      if (lineIds.length > 1) {
        const latlngs = lineIds
          .map((id) => PLACE_BY_ID[id])
          .filter((place): place is Place => !!place)
          .map((place) => L.latLng(place.lat, place.lng));
        const color = token(lineKind === "plan" ? "--color-brick" : "--color-river", "#1f6a72");
        lineRef.current = L.polyline(latlngs, {
          color,
          weight: 4,
          opacity: 0.9,
          dashArray: "7 9",
        }).addTo(map);
      }

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (lineChanged && lineIds.length > 1 && lineRef.current) {
        map.fitBounds(lineRef.current.getBounds(), {
          padding: [36, 36],
          maxZoom: 16,
          animate: !reduced,
        });
        return;
      }

      const place = PLACE_BY_ID[selectedId];
      if (!place) return;
      const nextZoom = Math.max(map.getZoom(), 16);
      if (reduced) map.setView([place.lat, place.lng], nextZoom);
      else map.flyTo([place.lat, place.lng], nextZoom, { duration: 0.55 });
    })();

    return () => {
      dead = true;
    };
  }, [ready, selectedId, lineIds, lineKey, lineKind]);

  return <div ref={hostRef} className="nt-map h-full w-full" />;
}
