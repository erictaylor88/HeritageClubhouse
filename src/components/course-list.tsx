"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeCourseEntry } from "@/app/map/actions";
import {
  COURSE_STATUSES,
  STATUS_META,
  courseTitle,
  type CourseEntry,
} from "@/lib/courses";

export function CourseList({ entries }: { entries: CourseEntry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function handleRemove(entryId: string) {
    setRemovingId(entryId);
    setError("");
    startTransition(async () => {
      const result = await removeCourseEntry(entryId);
      setRemovingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-muted)]">
        No courses yet. Search above to add your first stamp.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm text-[var(--oxblood)]">{error}</p>}
      {COURSE_STATUSES.map((status) => {
        const group = entries.filter((e) => e.status === status);
        if (group.length === 0) return null;
        return (
          <section key={status} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: `var(${STATUS_META[status].cssVar})` }}
              />
              {STATUS_META[status].label}
              <span className="text-[var(--ink-muted)]">· {group.length}</span>
            </h3>
            <ul className="flex flex-col gap-1.5">
              {group.map((entry) => (
                <li
                  key={entry.id}
                  className="group flex items-start justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--ink)]">
                      {courseTitle(entry.course)}
                    </p>
                    {entry.course.address && (
                      <p className="truncate text-xs text-[var(--ink-muted)]">
                        {entry.course.address}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(entry.id)}
                    disabled={pending && removingId === entry.id}
                    className="shrink-0 text-xs text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--oxblood)] hover:underline disabled:opacity-50"
                    aria-label={`Remove ${courseTitle(entry.course)}`}
                  >
                    {pending && removingId === entry.id ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
