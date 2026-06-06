"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { courseTitle, type CourseSearchResult } from "@/lib/courses";
import { parse18Birdies, ImportParseError } from "@/lib/import/18birdies";
import { matchCoursesToCache, importRounds } from "@/app/import/actions";
import type {
  CacheSuggestion,
  ConfirmedCourse,
  ImportResult,
  ParsedCourse,
  ParsedImport,
  ParsedRound,
} from "@/lib/import/types";

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 350;

/** Per-course choice the user makes in the review table. */
type Selection =
  | { kind: "pending" }
  | { kind: "matched"; course: CourseSearchResult }
  | { kind: "skip" };

/** Per-round course overrides for a source course: round index → target course. */
type RoundTargets = Record<number, CourseSearchResult>;

type Phase = "upload" | "match" | "done";

export function ImportWorkspace() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [parseError, setParseError] = useState("");

  const [suggestions, setSuggestions] = useState<
    Record<string, CacheSuggestion[]>
  >({});
  const [matching, setMatching] = useState(false);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  // sourceId → (roundIndex → target course), for splitting a multi-course club.
  const [roundTargets, setRoundTargets] = useState<
    Record<string, RoundTargets>
  >({});

  const [searchCount, setSearchCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  // ----- Upload + parse (client-side, free) --------------------------------
  async function handleFile(file: File) {
    setParseError("");
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const data = parse18Birdies(json);
      setParsed(data);
      setPhase("match");
      void loadSuggestions(data);
    } catch (err) {
      if (err instanceof ImportParseError) setParseError(err.message);
      else if (err instanceof SyntaxError)
        setParseError("That file isn't valid JSON.");
      else setParseError("Couldn't read that file.");
    }
  }

  // ----- Cache matching (DB only, no API) ----------------------------------
  async function loadSuggestions(data: ParsedImport) {
    setMatching(true);
    const map = await matchCoursesToCache(
      data.courses.map((c) => ({ sourceId: c.sourceId, sourceName: c.sourceName })),
    );
    setSuggestions(map);
    // Default: auto-select an "exact" cache match; everything else is pending.
    const initial: Record<string, Selection> = {};
    for (const course of data.courses) {
      const top = map[course.sourceId]?.[0];
      initial[course.sourceId] =
        top && top.confidence === "exact"
          ? { kind: "matched", course: top.course }
          : { kind: "pending" };
    }
    setSelections(initial);
    setMatching(false);
  }

  const setSelection = useCallback((sourceId: string, sel: Selection) => {
    setSelections((prev) => ({ ...prev, [sourceId]: sel }));
    // Changing the primary match invalidates any per-round overrides.
    setRoundTargets((prev) => {
      if (!prev[sourceId]) return prev;
      const next = { ...prev };
      delete next[sourceId];
      return next;
    });
  }, []);

  const setRoundTarget = useCallback(
    (sourceId: string, index: number, course: CourseSearchResult | null) => {
      setRoundTargets((prev) => {
        const forSource = { ...(prev[sourceId] ?? {}) };
        if (course) forSource[index] = course;
        else delete forSource[index];
        return { ...prev, [sourceId]: forSource };
      });
    },
    [],
  );

  const noteSearch = useCallback(() => setSearchCount((n) => n + 1), []);

  // ----- Plan: group matched rounds by their effective target course -------
  function buildPlan(): ConfirmedCourse[] {
    if (!parsed) return [];
    const groups = new Map<string, ConfirmedCourse>();
    for (const c of parsed.courses) {
      const sel = selections[c.sourceId];
      if (sel?.kind !== "matched") continue;
      const overrides = roundTargets[c.sourceId] ?? {};
      c.rounds.forEach((round, i) => {
        const target = overrides[i] ?? sel.course;
        let g = groups.get(target.courseId);
        if (!g) {
          g = { sourceId: target.courseId, course: target, rounds: [] };
          groups.set(target.courseId, g);
        }
        g.rounds.push(round);
      });
    }
    return [...groups.values()];
  }

  // ----- Confirm + import --------------------------------------------------
  async function handleImport() {
    const payload = buildPlan();
    if (payload.length === 0) return;

    setImporting(true);
    setImportError("");
    const res = await importRounds(payload);
    setImporting(false);
    if ("error" in res) {
      setImportError(res.error);
      return;
    }
    setResult(res);
    setPhase("done");
  }

  // ----- Render ------------------------------------------------------------
  if (phase === "done" && result) {
    return <ImportSummary result={result} />;
  }

  if (phase === "upload") {
    return (
      <div className="flex flex-col gap-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center transition-colors hover:border-[var(--brass)]">
          <span className="font-[family-name:var(--font-display)] text-lg font-medium text-[var(--ink)]">
            Choose your 18Birdies export
          </span>
          <span className="text-sm text-[var(--ink-muted)]">
            A <code>.json</code> file from 18Birdies → Settings → Download my data
          </span>
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
        {parseError && (
          <p className="text-sm text-[var(--oxblood)]">{parseError}</p>
        )}
      </div>
    );
  }

  // phase === "match"
  if (!parsed) return null;

  const matchedCount = parsed.courses.filter(
    (c) => selections[c.sourceId]?.kind === "matched",
  ).length;
  const skipCount = parsed.courses.filter(
    (c) => selections[c.sourceId]?.kind === "skip",
  ).length;
  const pendingCount = parsed.courses.length - matchedCount - skipCount;
  const plan = buildPlan();
  const targetCount = plan.length;
  const roundsToImport = plan.reduce((n, g) => n + g.rounds.length, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Summary header */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
        <p className="font-[family-name:var(--font-display)] text-lg font-medium text-[var(--ink)]">
          {parsed.courses.length} courses · {parsed.totalRounds} rounds
          {parsed.dateRange && (
            <span className="text-[var(--ink-muted)]">
              {" "}
              · {parsed.dateRange.from.slice(0, 4)}–{parsed.dateRange.to.slice(0, 4)}
            </span>
          )}
        </p>
        <p className="mt-1 font-[family-name:var(--font-mono)] text-xs text-[var(--ink-muted)]">
          {matchedCount} matched · {pendingCount} to review · {skipCount} skipped
        </p>
        <p className="mt-2 text-xs text-[var(--ink-muted)]">
          Course searches share a 50/day quota — pace them, and you can finish
          another time. Already-imported rounds won&apos;t duplicate.
          {searchCount > 0 && (
            <span className="ml-1 font-[family-name:var(--font-mono)]">
              ({searchCount} search{searchCount === 1 ? "" : "es"} used)
            </span>
          )}
        </p>
      </div>

      {matching && (
        <p className="text-sm text-[var(--ink-muted)]" role="status">
          Matching against courses already on file…
        </p>
      )}

      {/* Course rows */}
      <ul className="flex flex-col gap-2">
        {parsed.courses.map((course) => (
          <CourseRow
            key={course.sourceId}
            course={course}
            suggestions={suggestions[course.sourceId] ?? []}
            selection={selections[course.sourceId] ?? { kind: "pending" }}
            roundTargets={roundTargets[course.sourceId] ?? {}}
            onChange={(sel) => setSelection(course.sourceId, sel)}
            onSetRoundTarget={(i, c) => setRoundTarget(course.sourceId, i, c)}
            onSearchFired={noteSearch}
          />
        ))}
      </ul>

      {/* Confirm */}
      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-[var(--line)] bg-[var(--paper)] py-4">
        {importError && (
          <p className="text-sm text-[var(--oxblood)]">{importError}</p>
        )}
        {pendingCount > 0 && (
          <p className="text-xs text-[var(--ink-muted)]">
            {pendingCount} course{pendingCount === 1 ? "" : "s"} still need a match
            or skip — they&apos;ll be left for later.
          </p>
        )}
        <Button
          onClick={handleImport}
          disabled={importing || targetCount === 0}
          className="w-full sm:w-auto"
        >
          {importing
            ? "Importing…"
            : `Import ${targetCount} course${targetCount === 1 ? "" : "s"} (${roundsToImport} rounds)`}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable debounced course-search field (shared by the row match + per-round
// override). Same cap discipline as the main map search: min length, debounce,
// abort superseded requests, soft-fail on 429.
// ---------------------------------------------------------------------------

type SearchState = "idle" | "searching" | "done" | "error" | "rate-limited";

function CourseSearchField({
  placeholder,
  ariaLabel,
  onPick,
  onSearchFired,
}: {
  placeholder: string;
  ariaLabel: string;
  onPick: (course: CourseSearchResult) => void;
  onSearchFired: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseSearchResult[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(async () => {
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
      onSearchFired();
      try {
        const res = await fetch(`/api/courses/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
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
        if ((err as Error).name === "AbortError") return;
        setState("error");
        setResults([]);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, onSearchFired]);

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      {state === "searching" && (
        <p className="text-xs text-[var(--ink-muted)]" role="status">
          Searching…
        </p>
      )}
      {state === "rate-limited" && (
        <p className="text-xs text-[var(--oxblood)]">
          Search is busy — give it a moment.
        </p>
      )}
      {state === "error" && (
        <p className="text-xs text-[var(--oxblood)]">
          Couldn&apos;t search right now.
        </p>
      )}
      {state === "done" && results.length === 0 && (
        <p className="text-xs text-[var(--ink-muted)]">No matches found.</p>
      )}
      {results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((r) => (
            <li key={r.courseId}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setQuery("");
                  setResults([]);
                  setState("idle");
                }}
                className="w-full rounded-md border border-[var(--line)] bg-[var(--paper)] p-2 text-left transition-colors hover:border-[var(--brass)] hover:bg-[var(--paper-sunk)]"
              >
                <span className="block text-sm font-medium text-[var(--ink)]">
                  {courseTitle(r)}
                </span>
                {r.address && (
                  <span className="block text-xs text-[var(--ink-muted)]">
                    {r.address}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One reviewable course row: matched chip, cache suggestions, search, skip, and
// (for matched multi-round courses) an optional per-round course split.
// ---------------------------------------------------------------------------

function courseDateRange(course: ParsedCourse): string | null {
  let from: string | null = null;
  let to: string | null = null;
  for (const r of course.rounds) {
    if (!r.datePlayed) continue;
    if (from === null || r.datePlayed < from) from = r.datePlayed;
    if (to === null || r.datePlayed > to) to = r.datePlayed;
  }
  if (!from || !to) return null;
  const fy = from.slice(0, 4);
  const ty = to.slice(0, 4);
  return fy === ty ? fy : `${fy}–${ty}`;
}

function roundLabel(round: ParsedRound): string {
  const date = round.datePlayed ?? "Undated";
  return round.score !== null ? `${date} · ${round.score}` : date;
}

function CourseRow({
  course,
  suggestions,
  selection,
  roundTargets,
  onChange,
  onSetRoundTarget,
  onSearchFired,
}: {
  course: ParsedCourse;
  suggestions: CacheSuggestion[];
  selection: Selection;
  roundTargets: RoundTargets;
  onChange: (sel: Selection) => void;
  onSetRoundTarget: (index: number, course: CourseSearchResult | null) => void;
  onSearchFired: () => void;
}) {
  const [splitOpen, setSplitOpen] = useState(false);
  const meta = [
    `${course.rounds.length} round${course.rounds.length === 1 ? "" : "s"}`,
    courseDateRange(course),
  ]
    .filter(Boolean)
    .join(" · ");

  // Distinct alternate targets already chosen for this course (+ the primary),
  // surfaced as one-click options so re-assigning more rounds doesn't re-search.
  const overrideValues = Object.values(roundTargets);
  const quickTargets: CourseSearchResult[] = [];
  if (selection.kind === "matched") quickTargets.push(selection.course);
  for (const c of overrideValues) {
    if (!quickTargets.some((q) => q.courseId === c.courseId)) quickTargets.push(c);
  }

  const canSplit = selection.kind === "matched" && course.rounds.length >= 2;

  return (
    <li className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-[family-name:var(--font-display)] text-[15px] font-medium text-[var(--ink)]">
            {course.sourceName}
          </p>
          <p className="mt-0.5 font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
            {meta}
          </p>
        </div>
        {selection.kind === "matched" && (
          <span className="shrink-0 rounded-full border border-[var(--status-played)] bg-[var(--paper-sunk)] px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-[var(--forest)]">
            ✓ Matched
          </span>
        )}
        {selection.kind === "skip" && (
          <span className="shrink-0 rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-[var(--ink-muted)]">
            Skipped
          </span>
        )}
      </div>

      {/* Matched state */}
      {selection.kind === "matched" && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm text-[var(--ink)]">
              {courseTitle(selection.course)}
            </p>
            <button
              type="button"
              onClick={() => onChange({ kind: "pending" })}
              className="shrink-0 text-xs text-[var(--ink-muted)] underline-offset-2 hover:underline"
            >
              Change
            </button>
          </div>

          {canSplit && (
            <button
              type="button"
              onClick={() => setSplitOpen((v) => !v)}
              className="self-start font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.1em] text-[var(--brass-deep)] underline-offset-2 hover:underline"
            >
              {splitOpen
                ? "Done splitting"
                : "Played different courses here? Split rounds →"}
            </button>
          )}

          {canSplit && splitOpen && (
            <ul className="flex flex-col gap-1.5 border-t border-[var(--line)] pt-2">
              {course.rounds.map((round, i) => (
                <RoundAssignRow
                  key={i}
                  label={roundLabel(round)}
                  primary={selection.course}
                  override={roundTargets[i]}
                  quickTargets={quickTargets}
                  onSet={(c) => onSetRoundTarget(i, c)}
                  onSearchFired={onSearchFired}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Skipped state */}
      {selection.kind === "skip" && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => onChange({ kind: "pending" })}
            className="text-xs text-[var(--ink-muted)] underline-offset-2 hover:underline"
          >
            Undo skip
          </button>
        </div>
      )}

      {/* Pending: suggestions + search + skip */}
      {selection.kind === "pending" && (
        <div className="mt-2.5 flex flex-col gap-2">
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.course.courseId}
                  type="button"
                  onClick={() => onChange({ kind: "matched", course: s.course })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--brass)] hover:bg-[var(--paper-sunk)]"
                  title={s.course.address ?? undefined}
                >
                  {courseTitle(s.course)}
                  <span className="text-[var(--ink-muted)]">
                    {s.confidence === "exact" ? "exact" : "likely"}
                  </span>
                </button>
              ))}
            </div>
          )}

          <CourseSearchField
            placeholder="Search for this course…"
            ariaLabel={`Search for ${course.sourceName}`}
            onPick={(c) => onChange({ kind: "matched", course: c })}
            onSearchFired={onSearchFired}
          />

          <button
            type="button"
            onClick={() => onChange({ kind: "skip" })}
            className="self-start text-xs text-[var(--ink-muted)] underline-offset-2 hover:underline"
          >
            Skip this course
          </button>
        </div>
      )}
    </li>
  );
}

/** One round inside the split panel: shows its effective target + lets you change it. */
function RoundAssignRow({
  label,
  primary,
  override,
  quickTargets,
  onSet,
  onSearchFired,
}: {
  label: string;
  primary: CourseSearchResult;
  override: CourseSearchResult | undefined;
  quickTargets: CourseSearchResult[];
  onSet: (course: CourseSearchResult | null) => void;
  onSearchFired: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const effective = override ?? primary;

  return (
    <li className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.06em] text-[var(--ink)] tabular-nums">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setChanging((v) => !v)}
          className="shrink-0 text-[0.7rem] text-[var(--ink-muted)] underline-offset-2 hover:underline"
        >
          {changing ? "Close" : "Change"}
        </button>
      </div>
      <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">
        → {courseTitle(effective)}
        {override && (
          <button
            type="button"
            onClick={() => onSet(null)}
            className="ml-2 text-[var(--brass-deep)] underline-offset-2 hover:underline"
          >
            reset
          </button>
        )}
      </p>

      {changing && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {quickTargets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {quickTargets.map((t) => (
                <button
                  key={t.courseId}
                  type="button"
                  onClick={() => {
                    onSet(t.courseId === primary.courseId ? null : t);
                    setChanging(false);
                  }}
                  className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[0.7rem] text-[var(--ink)] transition-colors hover:border-[var(--brass)] hover:bg-[var(--paper-sunk)]"
                >
                  {courseTitle(t)}
                </button>
              ))}
            </div>
          )}
          <CourseSearchField
            placeholder="Search for the course this round was on…"
            ariaLabel="Search for this round's course"
            onPick={(c) => {
              onSet(c.courseId === primary.courseId ? null : c);
              setChanging(false);
            }}
            onSearchFired={onSearchFired}
          />
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Post-import summary.
// ---------------------------------------------------------------------------

function ImportSummary({ result }: { result: ImportResult }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.16em] text-[var(--brass-deep)]">
          Import complete
        </p>
        <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
          {result.roundsInserted} round{result.roundsInserted === 1 ? "" : "s"} added
          across {result.coursesImported} course
          {result.coursesImported === 1 ? "" : "s"}
        </p>
        {result.roundsSkipped > 0 && (
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {result.roundsSkipped} already on file — skipped to avoid duplicates.
          </p>
        )}
      </div>

      {result.perCourse.some((c) => c.error) && (
        <div className="rounded-md border border-[var(--oxblood)]/40 bg-[var(--surface)] p-3">
          <p className="text-sm font-medium text-[var(--oxblood)]">
            Some courses couldn&apos;t be imported:
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-[var(--ink-muted)]">
            {result.perCourse
              .filter((c) => c.error)
              .map((c) => (
                <li key={c.sourceId}>
                  {c.courseTitle}: {c.error}
                </li>
              ))}
          </ul>
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-[var(--ink-muted)]">
          Per-course breakdown
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {result.perCourse.map((c) => (
            <li
              key={c.sourceId}
              className="flex justify-between gap-3 border-b border-[var(--line)] py-1"
            >
              <span className="truncate text-[var(--ink)]">{c.courseTitle}</span>
              <span className="shrink-0 font-[family-name:var(--font-mono)] text-xs text-[var(--ink-muted)]">
                +{c.inserted}
                {c.skipped > 0 && ` · ${c.skipped} dup`}
              </span>
            </li>
          ))}
        </ul>
      </details>

      <Link
        href="/map"
        className="inline-flex w-fit items-center gap-2 rounded-md bg-[var(--forest)] px-4 py-2 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--forest-mid)]"
      >
        View your map →
      </Link>
    </div>
  );
}
