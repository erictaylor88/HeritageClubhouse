"use client";

import dynamic from "next/dynamic";
import type { CourseEntry } from "@/lib/courses";
import type { FriendOverlay } from "@/lib/follow";

// Leaflet touches `window` at import time, so the map must be client-only.
const CourseMap = dynamic(
  () => import("./course-map").then((m) => m.CourseMap),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  },
);

/** Branded placeholder while the Leaflet bundle + tiles load. */
function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--paper-sunk)]">
      <span
        className="animate-pulse font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]"
        role="status"
      >
        Unrolling the map…
      </span>
    </div>
  );
}

export function MapCanvas({
  entries,
  friends = [],
}: {
  entries: CourseEntry[];
  friends?: FriendOverlay[];
}) {
  return <CourseMap entries={entries} friends={friends} />;
}
