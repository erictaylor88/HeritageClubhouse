"use client";

import dynamic from "next/dynamic";
import type { CourseEntry } from "@/lib/courses";
import type { FriendOverlay } from "@/lib/follow";

// Leaflet touches `window` at import time, so the map must be client-only.
const CourseMap = dynamic(
  () => import("./course-map").then((m) => m.CourseMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-[var(--paper-sunk)]" />,
  },
);

export function MapCanvas({
  entries,
  friends = [],
}: {
  entries: CourseEntry[];
  friends?: FriendOverlay[];
}) {
  return <CourseMap entries={entries} friends={friends} />;
}
