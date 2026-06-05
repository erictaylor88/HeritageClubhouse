"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import {
  COURSE_STATUSES,
  STATUS_META,
  courseMonogram,
  courseTitle,
  type CourseEntry,
  type CourseStatus,
} from "@/lib/courses";
import { type FriendOverlay } from "@/lib/follow";
import { StatusChip, StatusSwatch } from "@/components/status-chip";
import { useMapSelection } from "@/components/map-selection";

/** Whether the user has asked the OS to minimize motion. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Eric is in Irvine, CA — default the empty-map view over Orange County / SoCal.
const DEFAULT_CENTER: [number, number] = [33.6846, -117.8265];
const DEFAULT_ZOOM = 9;

const STADIA_TILE_URL =
  "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png";
const STADIA_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noreferrer">Stadia Maps</a> ' +
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

/** Escape text interpolated into a divIcon's raw HTML (friend names are user-set). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
    html: `<span class="hc-stamp-badge" style="--c:var(${cssVar});--ring-style:${ring}" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${escapeHtml(monogram)}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -20],
  });
}

/**
 * A friend's "guest stamp": the same badge form *filled* in the friend's color
 * with a paper monogram (their initial). The fill/outline inversion vs. your own
 * outlined status stamps reads as "theirs vs. yours" without leaning on the
 * status palette (design spec §9 — never color-only). One icon per friend; all
 * their pins share it.
 */
function guestIcon(color: string, monogram: string, label: string): L.DivIcon {
  return L.divIcon({
    className: "hc-stamp hc-stamp-guest",
    html: `<span class="hc-stamp-badge" style="--c:${color}" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${escapeHtml(monogram)}</span>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -18],
  });
}

/** First alphanumeric character of a name, for a friend's stamp monogram. */
function initial(name: string): string {
  const match = name.match(/[a-z0-9]/i);
  return match ? match[0].toUpperCase() : "•";
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

/**
 * Flies the map to the focused course's pin and opens its popup, in response to
 * a logbook row click (driven by `focusTick` from the selection context, so a
 * repeat click on the same row re-flies). Honors prefers-reduced-motion by
 * jumping instead of animating.
 */
function FocusController({
  entries,
  selectedCourseId,
  focusTick,
  markerRefs,
}: {
  entries: CourseEntry[];
  selectedCourseId: string | null;
  focusTick: number;
  markerRefs: RefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (focusTick === 0 || !selectedCourseId) return;
    const entry = entries.find((e) => e.course.courseId === selectedCourseId);
    if (!entry) return;
    const target: [number, number] = [entry.course.lat, entry.course.lng];
    const zoom = Math.max(map.getZoom(), 13);
    if (prefersReducedMotion()) {
      map.setView(target, zoom, { animate: false });
    } else {
      map.flyTo(target, zoom, { duration: 0.75 });
    }
    markerRefs.current.get(selectedCourseId)?.openPopup();
    // Intentionally fire only on focus requests, not on every selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick]);
  return null;
}

export function CourseMap({
  entries,
  friends = [],
}: {
  entries: CourseEntry[];
  friends?: FriendOverlay[];
}) {
  const { selectedCourseId, focusTick, selectCourse } = useMapSelection();
  // Live marker handles by course_id, so the FocusController can open popups.
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  // Which friends' overlays are currently shown. Overlay is opt-in — starts off.
  // Reads always intersect with the current `friends`, so a stale id (after an
  // unfollow) is harmless and needs no pruning effect.
  const [visibleFriends, setVisibleFriends] = useState<Set<string>>(new Set());

  // Status layer filter — all on by default. Toggling hides that status's pins.
  const [activeStatuses, setActiveStatuses] = useState<Set<CourseStatus>>(
    () => new Set(COURSE_STATUSES),
  );
  const visibleEntries = useMemo(
    () => entries.filter((e) => activeStatuses.has(e.status)),
    [entries, activeStatuses],
  );

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

  // One guest icon per friend (shared across their pins).
  const friendIcons = useMemo(
    () =>
      new Map(
        friends.map((f) => [
          f.id,
          guestIcon(f.color, initial(f.name), `${f.name}'s courses`),
        ] as const),
      ),
    [friends],
  );

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer url={STADIA_TILE_URL} attribution={STADIA_ATTRIBUTION} />
        {visibleEntries.map((entry) => {
          const meta = STATUS_META[entry.status];
          return (
            <Marker
              key={entry.id}
              position={[entry.course.lat, entry.course.lng]}
              icon={icons.get(entry.id)}
              ref={(m) => {
                if (m) markerRefs.current.set(entry.course.courseId, m);
                else markerRefs.current.delete(entry.course.courseId);
              }}
              eventHandlers={{
                click: () => selectCourse(entry.course.courseId),
              }}
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

        {/* Friend overlays: each visible friend's readable courses. */}
        {friends
          .filter((f) => visibleFriends.has(f.id))
          .flatMap((friend) =>
            friend.entries.map((entry) => (
              <Marker
                key={`${friend.id}:${entry.id}`}
                position={[entry.course.lat, entry.course.lng]}
                icon={friendIcons.get(friend.id)}
              >
                <Popup>
                  <span
                    className="mb-2 block h-0.5 w-8 rounded-full"
                    style={{ backgroundColor: friend.color }}
                  />
                  <div className="flex flex-col gap-1">
                    <span
                      className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.12em]"
                      style={{ color: friend.color }}
                    >
                      {friend.name}
                    </span>
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
            )),
          )}

        <FitToEntries entries={entries} />
        <FocusController
          entries={entries}
          selectedCourseId={selectedCourseId}
          focusTick={focusTick}
          markerRefs={markerRefs}
        />
      </MapContainer>

      {/* Empty-state hint: a gentle floating note over the default view when
          you've added no courses yet. Non-interactive so it never blocks the
          map underneath. */}
      {entries.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-[500] flex justify-center px-4">
          <p className="max-w-xs rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-4 py-2 text-center font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-muted)] shadow-[var(--shadow-sm)] backdrop-blur-sm">
            Add a course to drop your first stamp here
          </p>
        </div>
      )}

      {entries.length > 0 && (
        <StatusFilterControl
          entries={entries}
          active={activeStatuses}
          onToggle={(status) =>
            setActiveStatuses((prev) => {
              const next = new Set(prev);
              if (next.has(status)) next.delete(status);
              else next.add(status);
              return next;
            })
          }
        />
      )}

      {friends.length > 0 && (
        <FriendOverlayControl
          friends={friends}
          visible={visibleFriends}
          onToggle={(id) =>
            setVisibleFriends((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onShowAll={() => setVisibleFriends(new Set(friends.map((f) => f.id)))}
          onHideAll={() => setVisibleFriends(new Set())}
        />
      )}
    </div>
  );
}

/**
 * Status layer filter: toggle played / upcoming / bucket-list pins on the map.
 * Sits top-left as a small always-open panel (only three rows). A status with
 * no courses is omitted; toggling one off dims its row and hides its pins.
 */
function StatusFilterControl({
  entries,
  active,
  onToggle,
}: {
  entries: CourseEntry[];
  active: Set<CourseStatus>;
  onToggle: (status: CourseStatus) => void;
}) {
  return (
    <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-0.5 rounded-md border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-md)]">
      {COURSE_STATUSES.map((status) => {
        const count = entries.filter((e) => e.status === status).length;
        if (count === 0) return null;
        const on = active.has(status);
        return (
          <button
            key={status}
            type="button"
            onClick={() => onToggle(status)}
            aria-pressed={on}
            className={`flex items-center gap-2 rounded px-2 py-1 text-left transition-opacity hover:bg-[var(--paper-sunk)] ${
              on ? "opacity-100" : "opacity-40"
            }`}
          >
            <StatusSwatch status={status} />
            <span className="text-xs text-[var(--ink)]">
              {STATUS_META[status].label}
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[0.7rem] text-[var(--ink-muted)]">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Map overlay control: toggle which followed friends' maps overlay yours. Sits
 * above the map (a sibling of the Leaflet container, so it doesn't feed the map
 * pan/zoom handlers). Collapsed to a compact pill until opened.
 */
function FriendOverlayControl({
  friends,
  visible,
  onToggle,
  onShowAll,
  onHideAll,
}: {
  friends: FriendOverlay[];
  visible: Set<string>;
  onToggle: (id: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const shownCount = friends.filter((f) => visible.has(f.id)).length;

  return (
    <div className="absolute right-3 top-3 z-[1000] w-56 max-w-[calc(100%-1.5rem)] overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          Friends on map
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[0.7rem] text-[var(--ink-muted)]">
          {shownCount}/{friends.length} {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--line)]">
          <div className="flex items-center justify-end gap-3 px-3 py-1.5 text-[0.7rem]">
            <button
              type="button"
              onClick={onShowAll}
              className="text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--brass-deep)] hover:underline"
            >
              Show all
            </button>
            <button
              type="button"
              onClick={onHideAll}
              className="text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--brass-deep)] hover:underline"
            >
              Hide all
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto pb-1">
            {friends.map((friend) => {
              const on = visible.has(friend.id);
              return (
                <li key={friend.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(friend.id)}
                    aria-pressed={on}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--paper-sunk)]"
                  >
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full border"
                      style={{
                        backgroundColor: on ? friend.color : "transparent",
                        borderColor: friend.color,
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">
                      {friend.name}
                    </span>
                    <span className="shrink-0 font-[family-name:var(--font-mono)] text-[0.7rem] text-[var(--ink-muted)]">
                      {friend.entries.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
