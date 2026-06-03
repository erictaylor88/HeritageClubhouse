"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import {
  STATUS_META,
  courseTitle,
  type CourseEntry,
  type CourseStatus,
} from "@/lib/courses";

// Eric is in Irvine, CA — default the empty-map view over Orange County / SoCal.
const DEFAULT_CENTER: [number, number] = [33.6846, -117.8265];
const DEFAULT_ZOOM = 9;

const STADIA_TILE_URL =
  "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png";
const STADIA_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noreferrer">Stadia Maps</a> ' +
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

/** A passport-stamp divIcon colored by status (uses the global --status-* vars). */
function stampIcon(status: CourseStatus): L.DivIcon {
  return L.divIcon({
    className: "hc-stamp",
    html: `<span class="hc-stamp-dot" style="--c:var(${STATUS_META[status].cssVar})"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

/** Fit the view to all pins once they're available; idle when the map is empty. */
function FitToEntries({ entries }: { entries: CourseEntry[] }) {
  const map = useMap();
  useEffect(() => {
    if (entries.length === 0) return;
    if (entries.length === 1) {
      const only = entries[0].course;
      map.setView([only.lat, only.lng], 12);
      return;
    }
    const bounds = L.latLngBounds(
      entries.map((e) => [e.course.lat, e.course.lng] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
  }, [entries, map]);
  return null;
}

export function CourseMap({ entries }: { entries: CourseEntry[] }) {
  // Stable icon instances per status (avoid rebuilding on every render).
  const icons = useMemo(
    () =>
      ({
        played: stampIcon("played"),
        upcoming: stampIcon("upcoming"),
        bucket_list: stampIcon("bucket_list"),
      }) satisfies Record<CourseStatus, L.DivIcon>,
    [],
  );

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer url={STADIA_TILE_URL} attribution={STADIA_ATTRIBUTION} />
      {entries.map((entry) => (
        <Marker
          key={entry.id}
          position={[entry.course.lat, entry.course.lng]}
          icon={icons[entry.status]}
        >
          <Popup>
            <div className="flex flex-col gap-1">
              <span className="font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--ink)]">
                {courseTitle(entry.course)}
              </span>
              {entry.course.address && (
                <span className="text-xs text-[var(--ink-muted)]">
                  {entry.course.address}
                </span>
              )}
              <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-[var(--ink)]">
                <span
                  className="size-2 rounded-full"
                  style={{
                    backgroundColor: `var(${STATUS_META[entry.status].cssVar})`,
                  }}
                />
                {STATUS_META[entry.status].label}
              </span>
            </div>
          </Popup>
        </Marker>
      ))}
      <FitToEntries entries={entries} />
    </MapContainer>
  );
}
