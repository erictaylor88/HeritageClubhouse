"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeCourseEntry, updateCourseEntry } from "@/app/map/actions";
import {
  COURSE_STATUSES,
  STATUS_META,
  courseTitle,
  formatDatePlayed,
  type CourseEntry,
} from "@/lib/courses";
import { StatusSwatch } from "@/components/status-chip";

export function CourseList({ entries }: { entries: CourseEntry[] }) {
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
                <EntryItem key={entry.id} entry={entry} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function EntryItem({ entry }: { entry: CourseEntry }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  // Edit-form state (strings for controlled inputs).
  const [datePlayed, setDatePlayed] = useState(entry.datePlayed ?? "");
  const [bestScore, setBestScore] = useState(
    entry.bestScore !== null ? String(entry.bestScore) : "",
  );
  const [notes, setNotes] = useState(entry.notes ?? "");

  const isPlayed = entry.status === "played";
  const hasDetails =
    (isPlayed && (entry.datePlayed || entry.bestScore !== null)) ||
    Boolean(entry.notes);

  function startEdit() {
    // Reset the form from the latest entry data, then open.
    setDatePlayed(entry.datePlayed ?? "");
    setBestScore(entry.bestScore !== null ? String(entry.bestScore) : "");
    setNotes(entry.notes ?? "");
    setError("");
    setEditing(true);
  }

  function handleSave() {
    setError("");
    startTransition(async () => {
      const result = await updateCourseEntry(entry.id, {
        datePlayed: isPlayed && datePlayed ? datePlayed : null,
        bestScore: isPlayed && bestScore !== "" ? Number(bestScore) : null,
        notes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

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
    <li className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-[family-name:var(--font-display)] text-[17px] font-medium leading-snug text-[var(--ink)]">
            {courseTitle(entry.course)}
          </p>
          {entry.course.address && (
            <p className="truncate text-xs text-[var(--ink-muted)]">
              {entry.course.address}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : startEdit())}
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

      {/* View-mode details (date / score / notes). */}
      {!editing && hasDetails && (
        <div className="mt-1.5 flex flex-col gap-1">
          {isPlayed && (entry.datePlayed || entry.bestScore !== null) && (
            <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              {entry.datePlayed && (
                <span>Played {formatDatePlayed(entry.datePlayed)}</span>
              )}
              {entry.datePlayed && entry.bestScore !== null && (
                <span> · </span>
              )}
              {entry.bestScore !== null && (
                <span>Best {entry.bestScore}</span>
              )}
            </p>
          )}
          {entry.notes && (
            <p className="text-xs italic text-[var(--ink-muted)]">
              {entry.notes}
            </p>
          )}
        </div>
      )}

      {/* Edit-mode form. */}
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="mt-3 flex flex-col gap-3 border-t border-[var(--line)] pt-3"
        >
          {isPlayed && (
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Date played
                </span>
                <input
                  type="date"
                  value={datePlayed}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDatePlayed(e.target.value)}
                  className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--brass)]"
                />
              </label>
              <label className="flex w-24 flex-col gap-1">
                <span className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Best score
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={300}
                  value={bestScore}
                  onChange={(e) => setBestScore(e.target.value)}
                  placeholder="—"
                  className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--brass)]"
                />
              </label>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="A memory, conditions, who you played with…"
              className="resize-y rounded-md border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--brass)]"
            />
          </label>

          {error && <p className="text-xs text-[var(--oxblood)]">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--forest)] px-3 py-1.5 text-xs font-medium text-[var(--paper)] transition-colors hover:bg-[var(--forest-mid)] disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition-colors hover:bg-[var(--paper-sunk)] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Remove error surfaced in view mode. */}
      {!editing && error && (
        <p className="mt-1.5 text-xs text-[var(--oxblood)]">{error}</p>
      )}
    </li>
  );
}
