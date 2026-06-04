"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { addCourseEntry } from "@/app/map/actions";
import {
  COURSE_STATUSES,
  STATUS_META,
  courseTitle,
  type CourseSearchResult,
  type CourseStatus,
} from "@/lib/courses";
import { StatusSwatch } from "@/components/status-chip";

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 350;

type SearchState = "idle" | "searching" | "done" | "error" | "rate-limited";

export function CourseSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseSearchResult[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();

    const timer = setTimeout(async () => {
      // Below the min length: clear results without calling the proxy.
      if (q.length < MIN_QUERY_LENGTH) {
        abortRef.current?.abort();
        setResults([]);
        setState("idle");
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState("searching");
      setError("");

      try {
        const res = await fetch(
          `/api/courses/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          setState("error");
          setResults([]);
          return;
        }
        const data = await res.json();
        if (data.rateLimited) {
          setState("rate-limited");
          setResults([]);
          return;
        }
        setResults(data.results ?? []);
        setState("done");
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // superseded
        setState("error");
        setResults([]);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  async function handleAdd(course: CourseSearchResult, status: CourseStatus) {
    setAdding(`${course.courseId}:${status}`);
    setError("");
    const result = await addCourseEntry(course, status);
    setAdding(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Clear the search and refresh the server-rendered list.
    setQuery("");
    setResults([]);
    setState("idle");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        placeholder="Search for a course…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search for a golf course"
      />

      {state === "searching" && (
        <>
          <p className="sr-only" role="status">
            Searching…
          </p>
          <ul className="flex flex-col gap-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3"
              >
                <div className="hc-skeleton h-4 w-2/3 rounded" />
                <div className="hc-skeleton mt-2 h-3 w-1/2 rounded" />
                <div className="mt-2.5 flex gap-1.5">
                  <div className="hc-skeleton h-6 w-16 rounded-full" />
                  <div className="hc-skeleton h-6 w-16 rounded-full" />
                  <div className="hc-skeleton h-6 w-20 rounded-full" />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {state === "rate-limited" && (
        <p className="text-sm text-[var(--oxblood)]">
          Search is busy right now — give it a moment and try again.
        </p>
      )}
      {state === "error" && (
        <p className="text-sm text-[var(--oxblood)]">
          Couldn&apos;t search right now. Try again in a moment.
        </p>
      )}
      {state === "done" && results.length === 0 && (
        <p className="text-sm text-[var(--ink-muted)]">
          No courses found for “{query.trim()}”.
        </p>
      )}
      {error && <p className="text-sm text-[var(--oxblood)]">{error}</p>}

      {results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((course) => (
            <li
              key={course.courseId}
              className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3"
            >
              <p className="font-[family-name:var(--font-display)] text-[17px] font-medium leading-snug text-[var(--ink)]">
                {courseTitle(course)}
              </p>
              {course.address && (
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                  {course.address}
                </p>
              )}
              {course.lat === null || course.lng === null ? (
                <p className="mt-2 text-xs text-[var(--ink-muted)]">
                  No coordinates from search — will resolve on add.
                </p>
              ) : null}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {COURSE_STATUSES.map((status) => {
                  const busy = adding === `${course.courseId}:${status}`;
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={adding !== null}
                      onClick={() => handleAdd(course, status)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--brass)] hover:bg-[var(--paper-sunk)] disabled:opacity-50"
                    >
                      <StatusSwatch status={status} className="size-2" />
                      {busy ? "Adding…" : STATUS_META[status].label}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
