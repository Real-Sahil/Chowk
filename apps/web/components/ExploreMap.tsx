"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Place = { slug: string; name: string; kind: string; lat: number; lng: number };
// Pilot centre is configuration, not code (OQ-2). Default is approximately Saddar, Karachi — confirm before launch.
const CENTRE: [number, number] = [Number(process.env.NEXT_PUBLIC_MAP_LNG ?? 67.0215), Number(process.env.NEXT_PUBLIC_MAP_LAT ?? 24.8560)];
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

export default function ExploreMap() {
  const el = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    if (!el.current) return;
    const map = new maplibregl.Map({ container: el.current, style: STYLE, center: CENTRE, zoom: 15.5, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => setStatus("ready"));
    map.on("error", () => setStatus((s) => (s === "ready" ? s : "error")));
    let cancelled = false;
    fetch("/api/session", { method: "POST" })
      .then(() => fetch("/api/places"))
      .then((r) => r.json())
      .then((d: { places?: Place[] }) => {
        if (cancelled) return;
        const list = d.places ?? [];
        setPlaces(list);
        for (const p of list) new maplibregl.Marker({ color: "#c2410c" }).setLngLat([p.lng, p.lat]).setPopup(new maplibregl.Popup({ offset: 20 }).setText(p.name)).addTo(map);
      })
      .catch(() => {});
    return () => { cancelled = true; map.remove(); };
  }, []);

  return (
    <div style={{ position: "relative", height: "100dvh", width: "100%" }}>
      <div ref={el} style={{ position: "absolute", inset: 0 }} aria-label="Map of the pilot area" />
      {status !== "ready" && (
        <p role="status" style={{ position: "absolute", top: 12, left: 12, right: 12, margin: 0, padding: "8px 12px", background: "#fff", borderRadius: 8 }}>
          {status === "loading" ? "Loading the map…" : "The map could not load. Check your connection and try again."}
        </p>
      )}
      <p style={{ position: "absolute", bottom: 12, left: 12, margin: 0, padding: "6px 10px", background: "#fffd", borderRadius: 8, fontSize: 13 }}>
        {places.length} place{places.length === 1 ? "" : "s"} · placeholder content
      </p>
    </div>
  );
}
