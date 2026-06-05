import {
  COURSE_STATUSES,
  STATUS_META,
  bestScore,
  courseTitle,
  formatDatePlayed,
  lastPlayed,
  roundCount,
  type CourseEntry,
} from "@/lib/courses";
import { StatusSwatch } from "@/components/status-chip";

/**
 * Read-only course list for the public share page — the same grouped layout as
 * the owner's CourseList, minus every interactive affordance (no edit, no
 * remove, no client state). Pure server component.
 */
export function PublicCourseList({ entries }: { entries: CourseEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-muted)]">
        No courses on this map yet.
      </p>
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
              {group.map((entry) => {
                const isPlayed = entry.status === "played";
                const last = lastPlayed(entry);
                const best = bestScore(entry);
                const plays = roundCount(entry);
                const hasPlayMeta = isPlayed && (last !== null || best !== null);
                const hasMeta = hasPlayMeta || Boolean(entry.notes);
                return (
                  <li
                    key={entry.id}
                    className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
                  >
                    <p className="font-[family-name:var(--font-display)] text-[17px] font-medium leading-snug text-[var(--ink)]">
                      {courseTitle(entry.course)}
                    </p>
                    {entry.course.address && (
                      <p className="truncate text-xs text-[var(--ink-muted)]">
                        {entry.course.address}
                      </p>
                    )}
                    {hasMeta && (
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
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
