/**
 * GolfCourseAPI client — SERVER ONLY.
 *
 * Hard rules this module exists to enforce (see CLAUDE.md):
 *  - `GOLFCOURSE_API_KEY` is read from server env only; the client never calls
 *    GolfCourseAPI directly.
 *  - Free tier = 50 requests/day (hard cap) + burst throttle (429). We never
 *    retry-hammer: a 429 is surfaced as a typed, soft error for callers to
 *    handle by serving cache / soft-failing.
 *
 * The detail call (`getCourseDetail`) is the coordinate fallback only — the
 * normal add-a-course path uses search-provided coords and the cache
 * write-through, so it should rarely run.
 */

const BASE_URL = "https://api.golfcourseapi.com";

/** Thrown when GolfCourseAPI returns 429 (daily cap or burst throttle). */
export class GolfApiRateLimitError extends Error {
  constructor(message = "GolfCourseAPI rate limit reached") {
    super(message);
    this.name = "GolfApiRateLimitError";
  }
}

/** Thrown for any non-429 GolfCourseAPI failure (incl. missing key). */
export class GolfApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GolfApiError";
    this.status = status;
  }
}

/** Normalized course shape that maps 1:1 onto the `course_cache` table. */
export type NormalizedCourse = {
  course_id: string;
  club_name: string | null;
  course_name: string | null;
  address: string | null;
  /** May be null from search ("for most records" coords are present, not all). */
  lat: number | null;
  lng: number | null;
  /** The raw API record, persisted to `course_cache.raw` for later use. */
  raw: unknown;
};

type RawRecord = Record<string, unknown>;

function getApiKey(): string {
  const key = process.env.GOLFCOURSE_API_KEY;
  if (!key) {
    throw new GolfApiError("GOLFCOURSE_API_KEY is not configured.");
  }
  return key;
}

async function request(path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        // GolfCourseAPI uses the "Key <token>" Authorization scheme.
        Authorization: `Key ${getApiKey()}`,
        Accept: "application/json",
      },
      // Server-side fetch; never cache search at the fetch layer.
      cache: "no-store",
    });
  } catch (err) {
    throw new GolfApiError(
      `GolfCourseAPI request failed: ${(err as Error).message}`,
    );
  }

  if (res.status === 429) {
    throw new GolfApiRateLimitError();
  }
  if (!res.ok) {
    throw new GolfApiError(
      `GolfCourseAPI responded with ${res.status}`,
      res.status,
    );
  }

  return res.json();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return null;
}

/**
 * Extracts coords/address/names from a raw GolfCourseAPI record. Defensive:
 * coords may sit under `location.latitude/longitude` (documented) or at the top
 * level; address may be a top-level string or composed from location parts.
 */
export function normalizeCourse(record: RawRecord): NormalizedCourse | null {
  const id =
    toStringOrNull(record.id) ??
    toStringOrNull(record.course_id) ??
    (typeof record.id === "number" ? String(record.id) : null);
  if (!id) return null;

  const location = (record.location ?? {}) as RawRecord;

  const lat = toNumber(location.latitude) ?? toNumber(record.latitude) ?? toNumber(record.lat);
  const lng =
    toNumber(location.longitude) ?? toNumber(record.longitude) ?? toNumber(record.lng);

  let address = toStringOrNull(record.address) ?? toStringOrNull(location.address);
  if (!address) {
    const parts = [
      toStringOrNull(location.city),
      toStringOrNull(location.state),
      toStringOrNull(location.country),
    ].filter((p): p is string => p !== null);
    address = parts.length ? parts.join(", ") : null;
  }

  return {
    course_id: id,
    club_name: toStringOrNull(record.club_name),
    course_name: toStringOrNull(record.course_name),
    address,
    lat,
    lng,
    raw: record,
  };
}

/** Pulls the array of course records out of whatever envelope the API uses. */
function extractCourseArray(payload: unknown): RawRecord[] {
  if (Array.isArray(payload)) return payload as RawRecord[];
  if (payload && typeof payload === "object") {
    const obj = payload as RawRecord;
    for (const key of ["courses", "results", "data"]) {
      if (Array.isArray(obj[key])) return obj[key] as RawRecord[];
    }
  }
  return [];
}

/** Pulls a single course record out of whatever envelope the API uses. */
function extractCourse(payload: unknown): RawRecord | null {
  if (payload && typeof payload === "object") {
    const obj = payload as RawRecord;
    if (obj.course && typeof obj.course === "object") return obj.course as RawRecord;
    if (obj.data && typeof obj.data === "object") return obj.data as RawRecord;
    // Some shapes return the course object directly.
    if (obj.id !== undefined || obj.course_id !== undefined) return obj;
  }
  return null;
}

/**
 * Search courses by free-text query. NOT cacheable (results aren't stable), so
 * callers must debounce hard + enforce a min query length before calling.
 * Throws `GolfApiRateLimitError` on 429 — callers should soft-fail.
 */
export async function searchCourses(query: string): Promise<NormalizedCourse[]> {
  const payload = await request(
    `/v1/search?search_query=${encodeURIComponent(query)}`,
  );
  return extractCourseArray(payload)
    .map(normalizeCourse)
    .filter((c): c is NormalizedCourse => c !== null);
}

/**
 * Fetch full detail for a single course. Coordinate fallback only — prefer
 * search-provided coords + the cache write-through. Throws
 * `GolfApiRateLimitError` on 429.
 */
export async function getCourseDetail(
  courseId: string,
): Promise<NormalizedCourse | null> {
  const payload = await request(`/v1/courses/${encodeURIComponent(courseId)}`);
  const record = extractCourse(payload);
  return record ? normalizeCourse(record) : null;
}
