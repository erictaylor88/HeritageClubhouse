"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addRound,
  moveRound,
  removeCourseEntry,
  removeRound,
  updateCourseEntry,
  updateRound,
} from "@/app/map/actions";
import { type RoundFields } from "@/lib/rounds";
import { useMapSelection } from "@/components/map-selection";
import {
  COURSE_STATUSES,
  STATUS_META,
  bestScore,
  courseTitle,
  formatDatePlayed,
  lastPlayed,
  roundCount,
  roundsByDateDesc,
  type CourseEntry,
  type Round,
} from "@/lib/courses";
import { StatusSwatch } from "@/components/status-chip";

/** A course a round can be moved onto: the user's other played entries. */
export type MoveTarget = { entryId: string; title: string };

export function CourseList({ entries }: { entries: CourseEntry[] }) {
  // Played courses are the valid destinations for moving a round (rounds belong
  // to courses you've played). Built once and passed down to each round row.
  const moveTargets: MoveTarget[] = entries
    .filter((e) => e.status === "played")
    .map((e) => ({ entryId: e.id, title: courseTitle(e.course) }));

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--line)] px-4 py-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-[15px] text-[var(--ink)]">
          No courses yet.
        </p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          Search above to add your first stamp.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {COURSE_STATUSES.map((status) => {
        const group = entries.filter((e) => e.status === status);
        if (group.length === 0) return null;
        return (
          <section key={status} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">
              <StatusSwatch status={status} />
              {STATUS_META[status].label}
              <span className="text-[var(--ink-muted)]">· {group.length}</span>
            </h3>
            <ul className="flex flex-col gap-1.5">
              {group.map((entry) => (
                <EntryItem
                  key={entry.id}
                  entry={entry}
                  moveTargets={moveTargets}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function EntryItem({
  entry,
  moveTargets,
}: {
  entry: CourseEntry;
  moveTargets: MoveTarget[];
}) {
  const router = useRouter();
  const { selectedCourseId, focusCourse } = useMapSelection();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  // Highlight + scroll into view when this course is selected on the map.
  const selected = selectedCourseId === entry.course.courseId;
  const liRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!selected) return;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    liRef.current?.scrollIntoView({
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [selected]);

  const isPlayed = entry.status === "played";
  const rounds = roundsByDateDesc(entry.rounds);
  const last = lastPlayed(entry);
  const best = bestScore(entry);
  const plays = roundCount(entry);
  const hasPlayMeta = isPlayed && (last !== null || best !== null);
  const hasViewMeta = hasPlayMeta || Boolean(entry.notes);

  function handleRemove() {
    setError("");
    startTransition(async () => {
      const result = await removeCourseEntry(entry.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li
      ref={liRef}
      className={`rounded-md border bg-[var(--surface)] px-3 py-2 transition-colors ${
        selected
          ? "border-[var(--brass)] ring-1 ring-[var(--brass)]"
          : "border-[var(--line)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/c/${entry.course.courseId}`}
            className="block truncate font-[family-name:var(--font-display)] text-[17px] font-medium leading-snug text-[var(--ink)] underline-offset-2 hover:text-[var(--brass-deep)] hover:underline"
          >
            {courseTitle(entry.course)}
          </Link>
          {entry.course.address && (
            <p className="truncate text-xs text-[var(--ink-muted)]">
              {entry.course.address}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => focusCourse(entry.course.courseId)}
            className="text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--brass-deep)] hover:underline"
            aria-label={`Show ${courseTitle(entry.course)} on the map`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setEditing((v) => !v);
            }}
            disabled={pending}
            className="text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--brass-deep)] hover:underline disabled:opacity-50"
          >
            {editing ? "Close" : "Edit"}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--oxblood)] hover:underline disabled:opacity-50"
            aria-label={`Remove ${courseTitle(entry.course)}`}
          >
            {pending && !editing ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>

      {/* View-mode summary: derived play meta + the course note. */}
      {!editing && hasViewMeta && (
        <div className="mt-1.5 flex flex-col gap-1">
          {hasPlayMeta && (
            <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              {last && <span>Played {formatDatePlayed(last)}</span>}
              {last && best !== null && <span> · </span>}
              {best !== null && <span>Best {best}</span>}
              {plays > 1 && <span> · {plays} rounds</span>}
            </p>
          )}
          {entry.notes && (
            <p className="text-xs italic text-[var(--ink-muted)]">
              {entry.notes}
            </p>
          )}
        </div>
      )}

      {/* Edit-mode panel: manage rounds (played only) + the course note. */}
      {editing && (
        <div className="mt-3 flex flex-col gap-4 border-t border-[var(--line)] pt-3">
          {isPlayed && (
            <RoundsManager
              entryId={entry.id}
              rounds={rounds}
              moveTargets={moveTargets.filter((t) => t.entryId !== entry.id)}
              onChanged={() => router.refresh()}
            />
          )}
          <CourseNoteForm entry={entry} onSaved={() => router.refresh()} />
        </div>
      )}

      {/* Remove error surfaced in view mode. */}
      {!editing && error && (
        <p className="mt-1.5 text-xs text-[var(--oxblood)]">{error}</p>
      )}
    </li>
  );
}

/** The rounds list + add-a-round affordance for a played course. */
function RoundsManager({
  entryId,
  rounds,
  moveTargets,
  onChanged,
}: {
  entryId: string;
  rounds: Round[];
  moveTargets: MoveTarget[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleAdd(fields: RoundFields) {
    setError("");
    startTransition(async () => {
      const result = await addRound(entryId, fields);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAdding(false);
      onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          Rounds{rounds.length > 0 && ` · ${rounds.length}`}
        </span>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setError("");
              setAdding(true);
            }}
            className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.1em] text-[var(--brass-deep)] underline-offset-2 hover:underline"
          >
            + Add a round
          </button>
        )}
      </div>

      {rounds.length === 0 && !adding && (
        <p className="text-xs text-[var(--ink-muted)]">
          No rounds logged yet — add one to record a date and score.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {rounds.map((round) => (
          <RoundRow
            key={round.id}
            round={round}
            moveTargets={moveTargets}
            onChanged={onChanged}
          />
        ))}
      </ul>

      {adding && (
        <RoundForm
          submitLabel="Add round"
          pending={pending}
          defaultToToday
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {error && <p className="text-xs text-[var(--oxblood)]">{error}</p>}
    </div>
  );
}

/** One round: a compact view row that flips into an edit form. */
function RoundRow({
  round,
  moveTargets,
  onChanged,
}: {
  round: Round;
  moveTargets: MoveTarget[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSave(fields: RoundFields) {
    setError("");
    startTransition(async () => {
      const result = await updateRound(round.id, fields);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      onChanged();
    });
  }

  function handleMove(targetEntryId: string) {
    setError("");
    startTransition(async () => {
      const result = await moveRound(round.id, targetEntryId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMoving(false);
      onChanged();
    });
  }

  function handleRemove() {
    setError("");
    startTransition(async () => {
      const result = await removeRound(round.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChanged();
    });
  }

  if (editing) {
    return (
      <li className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-2.5 py-2">
        <RoundForm
          submitLabel="Save"
          pending={pending}
          initial={round}
          onSubmit={handleSave}
          onCancel={() => setEditing(false)}
        />
        {error && <p className="mt-1.5 text-xs text-[var(--oxblood)]">{error}</p>}
      </li>
    );
  }

  const hasMeta = round.datePlayed || round.score !== null;
  return (
    <li className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.06em] text-[var(--ink)] tabular-nums">
            {round.datePlayed ? formatDatePlayed(round.datePlayed) : "Undated"}
            {round.score !== null && (
              <span className="text-[var(--ink-muted)]"> · {round.score}</span>
            )}
            {!hasMeta && <span className="text-[var(--ink-muted)]"> round</span>}
          </p>
          {round.notes && (
            <p className="mt-0.5 truncate text-xs italic text-[var(--ink-muted)]">
              {round.notes}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[0.7rem]">
          {moveTargets.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setMoving((v) => !v);
              }}
              disabled={pending}
              className="text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--brass-deep)] hover:underline disabled:opacity-50"
              aria-label="Move round to another course"
            >
              {moving ? "Cancel" : "Move"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setError("");
              setEditing(true);
            }}
            disabled={pending}
            className="text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--brass-deep)] hover:underline disabled:opacity-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--oxblood)] hover:underline disabled:opacity-50"
            aria-label="Remove round"
          >
            {pending ? "…" : "Remove"}
          </button>
        </div>
      </div>

      {/* Move picker: reassign this round to another of your played courses. */}
      {moving && (
        <div className="mt-2 border-t border-[var(--line)] pt-2">
          <p className="mb-1 font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Move this round to
          </p>
          <div className="flex flex-wrap gap-1.5">
            {moveTargets.map((t) => (
              <button
                key={t.entryId}
                type="button"
                onClick={() => handleMove(t.entryId)}
                disabled={pending}
                className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--ink)] transition-colors hover:border-[var(--brass)] hover:bg-[var(--paper-sunk)] disabled:opacity-50"
              >
                {t.title}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[0.7rem] text-[var(--ink-muted)]">
            Don&apos;t see it? Add the course with the search above first.
          </p>
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-[var(--oxblood)]">{error}</p>}
    </li>
  );
}

/** Shared add/edit form for a round's date / score / notes. */
function RoundForm({
  submitLabel,
  pending,
  initial,
  defaultToToday = false,
  onSubmit,
  onCancel,
}: {
  submitLabel: string;
  pending: boolean;
  initial?: Round;
  defaultToToday?: boolean;
  onSubmit: (fields: RoundFields) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [datePlayed, setDatePlayed] = useState(
    initial?.datePlayed ?? (defaultToToday ? today : ""),
  );
  const [score, setScore] = useState(
    initial?.score != null ? String(initial.score) : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          datePlayed: datePlayed || null,
          score: score !== "" ? Number(score) : null,
          notes,
        });
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Date played
          </span>
          <input
            type="date"
            value={datePlayed}
            max={today}
            onChange={(e) => setDatePlayed(e.target.value)}
            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--brass)]"
          />
        </label>
        <label className="flex w-20 flex-col gap-1">
          <span className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Score
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={300}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="—"
            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--brass)]"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          Round notes
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Conditions, who you played with, a memory…"
          className="resize-y rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--brass)]"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--forest)] px-3 py-1.5 text-xs font-medium text-[var(--paper)] transition-colors hover:bg-[var(--forest-mid)] disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition-colors hover:bg-[var(--paper-sunk)] disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Course-level note editor (status-agnostic). */
function CourseNoteForm({
  entry,
  onSaved,
}: {
  entry: CourseEntry;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const dirty = (entry.notes ?? "") !== notes.trim();

  function handleSave() {
    setError("");
    startTransition(async () => {
      const result = await updateCourseEntry(entry.id, notes);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          Course note
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="A note about this course…"
          className="resize-y rounded-md border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--brass)]"
        />
      </label>
      {error && <p className="text-xs text-[var(--oxblood)]">{error}</p>}
      <div>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className="rounded-md bg-[var(--forest)] px-3 py-1.5 text-xs font-medium text-[var(--paper)] transition-colors hover:bg-[var(--forest-mid)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save note"}
        </button>
      </div>
    </div>
  );
}
