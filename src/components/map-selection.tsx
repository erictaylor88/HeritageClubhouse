"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Shared selection state linking the logbook list and the map (which render in
 * separate panes of the workspace). Two directions:
 *  - logbook → map: `focusCourse` selects a course AND flies the map to its pin
 *    (and, on mobile, the workspace switches to the map pane).
 *  - map → logbook: `selectCourse` just marks a course selected, so the list
 *    highlights it and scrolls it into view (no map movement).
 *
 * `focusTick` increments on every focus request so a repeat click on the same
 * row re-flies. Keyed by `course_id` (unique within one user's entries).
 *
 * The default value is a no-op, so consumers (e.g. the public share map) work
 * fine without a provider.
 */
type MapSelectionValue = {
  selectedCourseId: string | null;
  focusTick: number;
  focusCourse: (courseId: string) => void;
  selectCourse: (courseId: string | null) => void;
  /** Subscribe to focus requests (e.g. to surface the map pane on mobile). */
  subscribeFocus: (listener: () => void) => () => void;
};

const noop = () => {};

const MapSelectionContext = createContext<MapSelectionValue>({
  selectedCourseId: null,
  focusTick: 0,
  focusCourse: noop,
  selectCourse: noop,
  subscribeFocus: () => noop,
});

export function useMapSelection() {
  return useContext(MapSelectionContext);
}

export function MapSelectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selectedCourseId, setSelected] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const listeners = useRef<Set<() => void>>(new Set());

  const focusCourse = useCallback((courseId: string) => {
    setSelected(courseId);
    setFocusTick((t) => t + 1);
    listeners.current.forEach((fn) => fn());
  }, []);

  const selectCourse = useCallback((courseId: string | null) => {
    setSelected(courseId);
  }, []);

  const subscribeFocus = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo(
    () => ({
      selectedCourseId,
      focusTick,
      focusCourse,
      selectCourse,
      subscribeFocus,
    }),
    [selectedCourseId, focusTick, focusCourse, selectCourse, subscribeFocus],
  );

  return (
    <MapSelectionContext.Provider value={value}>
      {children}
    </MapSelectionContext.Provider>
  );
}
