"use client";

import dynamic from "next/dynamic";
import type { CourseEntry } from "@/lib/courses";

// Leaflet touches `window` at import time, so the map must be client-only.
const CourseMap = dynamic(
  () => import("./course-map").then((m) => m.CourseMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-[var(--paper-sunk)]" />,
  },
);

export function MapCanvas({ entries }: { entries: CourseEntry[] }) {
  return <CourseMap entries={entries} />;
}
