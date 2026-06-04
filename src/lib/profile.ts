/**
 * Shared profile constants + validation (no server-only deps — safe to import
 * into client components). The DB enforces uniqueness on `username` and
 * `share_slug`; these helpers enforce shape/format before we ever hit the DB so
 * the user gets fast, friendly feedback.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const DISPLAY_NAME_MAX = 50;
export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

/** Lowercase letters, digits, and underscores only. */
const USERNAME_RE = /^[a-z0-9_]+$/;

/**
 * Slugs are friendlier than usernames: hyphens are allowed (the classic
 * URL-word separator), but a slug must start and end with an alphanumeric so we
 * never mint links like `/u/-eric_` or `/u/eric--`. Underscores allowed inside
 * too, for parity with usernames (the default slug is seeded from one).
 */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;

/**
 * Usernames double as the public share slug (`/u/[slug]`), so reserve the words
 * that would collide with real routes or read as impersonation.
 */
const RESERVED_USERNAMES = new Set([
  "u",
  "api",
  "auth",
  "map",
  "login",
  "logout",
  "admin",
  "account",
  "settings",
  "profile",
  "share",
  "www",
  "heritage",
  "clubhouse",
  "support",
  "help",
  "about",
]);

export type ValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Normalize a raw username input: trim + lowercase. Done before validation so
 * "EricT " becomes "erict". Returns the normalized string regardless of
 * validity — call `validateUsername` to check it.
 */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Validate a (pre-normalized or raw) username, returning the normalized value. */
export function validateUsername(raw: string): ValidationResult {
  const value = normalizeUsername(raw);
  if (value.length < USERNAME_MIN)
    return { ok: false, error: `Username must be at least ${USERNAME_MIN} characters.` };
  if (value.length > USERNAME_MAX)
    return { ok: false, error: `Username must be ${USERNAME_MAX} characters or fewer.` };
  if (!USERNAME_RE.test(value))
    return {
      ok: false,
      error: "Username can only use lowercase letters, numbers, and underscores.",
    };
  if (RESERVED_USERNAMES.has(value))
    return { ok: false, error: "That username is reserved. Try another." };
  return { ok: true, value };
}

/** Normalize a raw slug input: trim + lowercase. */
export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Validate a custom share slug, returning the normalized value. Same reserved
 * words as usernames (the slug lives in the same `/u/` namespace and reads as
 * identity), but allows hyphens and enforces clean start/end characters.
 */
export function validateShareSlug(raw: string): ValidationResult {
  const value = normalizeSlug(raw);
  if (value.length < SLUG_MIN)
    return { ok: false, error: `Link must be at least ${SLUG_MIN} characters.` };
  if (value.length > SLUG_MAX)
    return { ok: false, error: `Link must be ${SLUG_MAX} characters or fewer.` };
  if (!SLUG_RE.test(value))
    return {
      ok: false,
      error:
        "Link can use lowercase letters, numbers, hyphens, and underscores, and must start and end with a letter or number.",
    };
  if (RESERVED_USERNAMES.has(value))
    return { ok: false, error: "That link is reserved. Try another." };
  return { ok: true, value };
}

/** Validate an optional display name, collapsing empty to null. */
export function validateDisplayName(
  raw: string | null,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null) return { ok: true, value: null };
  const value = raw.trim();
  if (value.length === 0) return { ok: true, value: null };
  if (value.length > DISPLAY_NAME_MAX)
    return {
      ok: false,
      error: `Display name must be ${DISPLAY_NAME_MAX} characters or fewer.`,
    };
  return { ok: true, value };
}

/** The signed-in user's editable profile, as surfaced to the client. */
export type Profile = {
  username: string;
  displayName: string | null;
  isShared: boolean;
  shareSlug: string | null;
};
