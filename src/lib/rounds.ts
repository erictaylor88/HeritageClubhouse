/**
 * Round-field validation, shared by the interactive round CRUD (`map/actions.ts`)
 * and the bulk importer (`import/actions.ts`) so both enforce the same rules:
 * a real, non-future YYYY-MM-DD date and a whole-number score in golf range.
 * No server-only deps — pure functions, safe to import anywhere.
 */

/** Max length for any free-text note (course-level or per-round). */
export const MAX_NOTES = 2000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Editable per-round fields. */
export type RoundFields = {
  datePlayed: string | null;
  score: number | null;
  notes: string | null;
};

/** Trim + length-check a note, collapsing empty to null. */
export function sanitizeNotes(
  notes: string | null,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (typeof notes !== "string") return { ok: true, value: null };
  const trimmed = notes.trim();
  if (trimmed.length > MAX_NOTES)
    return { ok: false, error: `Notes must be ${MAX_NOTES} characters or fewer.` };
  return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}

/** Normalize + validate a round's fields, or return an error string. */
export function sanitizeRoundFields(
  fields: RoundFields,
): { ok: true; value: RoundFields } | { ok: false; error: string } {
  // Date played: null, or a real YYYY-MM-DD that isn't in the future.
  let datePlayed: string | null = null;
  if (fields.datePlayed) {
    const raw = fields.datePlayed.trim();
    if (!ISO_DATE.test(raw)) return { ok: false, error: "Invalid date." };
    const parsed = new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()))
      return { ok: false, error: "Invalid date." };
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (raw > todayUtc)
      return { ok: false, error: "Date played can't be in the future." };
    datePlayed = raw;
  }

  // Score: null, or an integer in a sane golf range.
  let score: number | null = null;
  if (fields.score !== null && fields.score !== undefined) {
    const n = Number(fields.score);
    if (!Number.isInteger(n) || n < 1 || n > 300)
      return { ok: false, error: "Score must be a whole number (1–300)." };
    score = n;
  }

  const notes = sanitizeNotes(fields.notes);
  if (!notes.ok) return notes;

  return { ok: true, value: { datePlayed, score, notes: notes.value } };
}
