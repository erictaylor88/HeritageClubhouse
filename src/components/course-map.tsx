"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import {
  STATUS_META,
  courseMonogram,
  courseTitle,
  type CourseEntry,
  type CourseStatus,
} from "@/lib/courses";
import { StatusChip } from "@/components/status-chip";

// Eric is in Irvine, CA — default the empty-map view over Orange County / SoCal.
const DEFAULT_CENTER: [number, number] = [33.6846, -117.8265];
const DEFAULT_ZOOM = 9;

const STADIA_TILE_URL =
  "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png";
const STADIA_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noreferrer">Stadia Maps</a> ' +
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

/**
 * A passport-stamp divIcon: status-colored ring (style encodes status), paper
 * fill, and the course monogram inked at center (design spec §6.3 / §8.1). The
 * 44px container gives a comfortable hit area around the 34px badge (§9).
 */
function stampIcon(
  status: CourseStatus,
  monogram: string,
  label: string,
): L.DivIcon {
  const { cssVar, ring } = STATUS_META[status];
  return L.divIcon({
    className: "hc-stamp",
    html: `<span class="hc-stamp-badge" style="--c:var(${cssVar});--ring-style:${ring}" role="img" aria-label="${label}" title="${label}">${monogram}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -20],
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
  // One stamp icon per entry — the monogram varies, so memoize on the inputs
  // that actually change the rendered badge.
  const icons = useMemo(
    () =>
      new Map(
        entries.map((e) => {
          const meta = STATUS_META[e.status];
          const title = courseTitle(e.course);
          return [
            e.id,
            stampIcon(
              e.status,
              courseMonogram(e.course),
              `${title}, ${meta.label}`,
            ),
          ] as const;
        }),
      ),
    [entries],
  );

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer url={STADIA_TILE_URL} attribution={STADIA_ATTRIBUTION} />
      {entries.map((entry) => {
        const meta = STATUS_META[entry.status];
        return (
          <Marker
            key={entry.id}
            position={[entry.course.lat, entry.course.lng]}
            icon={icons.get(entry.id)}
          >
            <Popup>
              {/* Top-edge status-color rule (design spec §8.2). */}
              <span
                className="mb-2 block h-0.5 w-8 rounded-full"
                style={{ backgroundColor: `var(${meta.cssVar})` }}
              />
              <div className="flex flex-col gap-1">
                <span className="font-[family-name:var(--font-display)] text-base font-medium leading-snug text-[var(--ink)]">
                  {courseTitle(entry.course)}
                </span>
                {entry.course.address && (
                  <span className="text-xs text-[var(--ink-muted)]">
                    {entry.course.address}
                  </span>
                )}
                <StatusChip status={entry.status} className="mt-1" />
              </div>
            </Popup>
          </Marker>
        );
      })}
      <FitToEntries entries={entries} />
    </MapContainer>
  );
}
