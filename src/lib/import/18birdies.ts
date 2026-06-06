/**
 * 18Birdies adapter — parses a GDPR JSON export into the shared {@link ParsedImport}
 * shape. Pure + defensive (no I/O, no deps): runs client-side in the review UI.
 *
 * Export shape (verified against a real archive):
 *   myData.clubData.playedClubs[]   = { clubId: string, name: string }   ← lookup
 *   myData.activityData.rounds[]    = { clubId: { id }, timestamp(ms), strokes, holeStrokes[] }
 *
 * `strokes` is the gross score we store; `score` is relative-to-par (ignored).
 * `holeStrokes.length` gives the hole count. Rounds whose club isn't in any club
 * list are still imported under a fallback label so no history is silently lost.
 */

import type { ParsedCourse, ParsedImport, ParsedRound } from "@/lib/import/types";

/** Thrown when the uploaded file isn't a recognizable 18Birdies export. */
export class ImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportParseError";
  }
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** A round's club id can be a bare string or `{ id }`; normalize to a string. */
function clubIdOf(value: unknown): string | null {
  if (typeof value === "string") return asString(value);
  const obj = asObject(value);
  return obj ? asString(obj.id) : null;
}

/** ms epoch → YYYY-MM-DD (UTC). Returns null for missing/invalid timestamps. */
function toIsoDate(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  return n >= 1 && n <= 300 ? n : null;
}

/**
 * Build the clubId→name lookup, preferring `playedClubs` but folding in the other
 * club lists so a round whose club only appears under `postedInClubs`/`followedClubs`
 * still resolves to a real name.
 */
function buildClubNames(clubData: Json | null): Map<string, string> {
  const names = new Map<string, string>();
  if (!clubData) return names;
  for (const key of ["playedClubs", "postedInClubs", "followedClubs"]) {
    const list = clubData[key];
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const obj = asObject(raw);
      if (!obj) continue;
      const id = clubIdOf(obj.clubId);
      const name = asString(obj.name);
      // First list wins (playedClubs is most authoritative).
      if (id && name && !names.has(id)) names.set(id, name);
    }
  }
  return names;
}

/**
 * Parse a parsed-JSON 18Birdies export. Accepts the raw object (the caller does
 * `JSON.parse`), tolerating both `{ myData: {...} }` and a bare `myData` payload.
 */
export function parse18Birdies(json: unknown): ParsedImport {
  const root = asObject(json);
  if (!root) throw new ImportParseError("File isn't valid JSON object data.");

  const myData = asObject(root.myData) ?? root;
  const activity = asObject(myData.activityData);
  const rounds = activity?.rounds;
  if (!Array.isArray(rounds)) {
    throw new ImportParseError(
      "This doesn't look like an 18Birdies export (no activityData.rounds).",
    );
  }

  const clubNames = buildClubNames(asObject(myData.clubData));

  // Group rounds by club id, in first-seen order.
  const byClub = new Map<string, ParsedCourse>();
  let totalRounds = 0;
  let from: string | null = null;
  let to: string | null = null;

  for (const raw of rounds) {
    const round = asObject(raw);
    if (!round) continue;
    const sourceId = clubIdOf(round.clubId);
    if (!sourceId) continue; // a round with no club can't be attributed

    const holeStrokes = Array.isArray(round.holeStrokes)
      ? round.holeStrokes
      : [];
    const parsed: ParsedRound = {
      datePlayed: toIsoDate(round.timestamp),
      score: toScore(round.strokes),
      holeCount: holeStrokes.length,
    };

    let course = byClub.get(sourceId);
    if (!course) {
      course = {
        sourceId,
        sourceName: clubNames.get(sourceId) ?? `Unknown course (${sourceId})`,
        rounds: [],
      };
      byClub.set(sourceId, course);
    }
    course.rounds.push(parsed);
    totalRounds += 1;

    if (parsed.datePlayed) {
      if (from === null || parsed.datePlayed < from) from = parsed.datePlayed;
      if (to === null || parsed.datePlayed > to) to = parsed.datePlayed;
    }
  }

  if (totalRounds === 0) {
    throw new ImportParseError("No rounds found in this export.");
  }

  // Most-played courses first — a friendlier review order.
  const courses = [...byClub.values()].sort(
    (a, b) => b.rounds.length - a.rounds.length,
  );

  return {
    source: "18birdies",
    courses,
    totalRounds,
    dateRange: from && to ? { from, to } : null,
  };
}
