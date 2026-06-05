"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useMapSelection } from "@/components/map-selection";

type View = "map" | "logbook";

/**
 * Two-pane workspace shell. On desktop the logbook panel and the map sit
 * side by side (the original layout). On mobile they collapse into a single
 * pane with a Map ⇄ Logbook segmented toggle — map-forward, so the map is
 * full-screen by default and the logbook is one tap away. The shared fixed
 * height (viewport minus the 3.5rem header) gives Leaflet a concrete box and
 * lets the panel scroll internally instead of pushing the map off-screen.
 */
export function MapWorkspace({
  panel,
  map,
}: {
  panel: React.ReactNode;
  map: React.ReactNode;
}) {
  const [view, setView] = useState<View>("map");

  // When a logbook row asks to be shown on the map (mobile), surface the map
  // pane. Subscribe so the switch happens in the focus callback, not in render.
  const { subscribeFocus } = useMapSelection();
  useEffect(
    () => subscribeFocus(() => setView("map")),
    [subscribeFocus],
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden md:flex-row">
      {/* Mobile-only segmented toggle. Hidden on md+ where both panes show. */}
      <div className="flex shrink-0 items-stretch gap-1 border-b border-[var(--line)] bg-[var(--surface)] p-1.5 md:hidden">
        <SegButton active={view === "map"} onClick={() => setView("map")}>
          Map
        </SegButton>
        <SegButton
          active={view === "logbook"}
          onClick={() => setView("logbook")}
        >
          Logbook
        </SegButton>
      </div>

      {/* Logbook panel: search + your courses + friends. */}
      <aside
        className={cn(
          "hc-grain w-full flex-col gap-6 overflow-y-auto bg-[var(--paper)] p-5 md:flex md:w-[360px] md:flex-none md:border-r md:border-[var(--line)]",
          view === "logbook" ? "flex flex-1" : "hidden",
        )}
      >
        {panel}
      </aside>

      {/* Interactive map with status-colored stamp pins. */}
      <main
        className={cn(
          "relative md:block md:flex-1",
          view === "map" ? "block flex-1" : "hidden",
        )}
      >
        {map}
      </main>
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-1 rounded-md px-3 py-1.5 text-center font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] transition-colors",
        active
          ? "bg-[var(--forest)] text-[var(--paper)]"
          : "text-[var(--ink-muted)] hover:bg-[var(--paper-sunk)]",
      )}
    >
      {children}
    </button>
  );
}
