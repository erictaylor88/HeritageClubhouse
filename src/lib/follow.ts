/**
 * Shared follow/friend types (no server-only deps — safe to import into client
 * components). The follow model is auto-accept: following someone is a single
 * insert into `follows`, no pending/approval state. Reading a friend's courses
 * is gated by RLS (`entries_follower_read`): the owner must have `is_shared`
 * AND the viewer must follow them.
 */

import { type CourseEntry } from "@/lib/courses";

/**
 * Per-friend marker colors for the map overlay. Warm, earthy hues kept clear of
 * the status palette (forest green / amber / slate-blue) so a friend's pin never
 * reads as a status — friend pins are *filled* in their color, your own pins are
 * *outlined* in their status color. Assigned by follow order; cycles if you
 * follow more friends than colors.
 */
export const FRIEND_COLORS = [
  "#b08d4f", // brass
  "#6e2a28", // oxblood
  "#6d4566", // plum
  "#a8552f", // terracotta
  "#5a5230", // olive-bronze
] as const;

export function friendColor(index: number): string {
  return FRIEND_COLORS[index % FRIEND_COLORS.length];
}

/** A member the signed-in user follows, with how many of their courses we can see. */
export type Friend = {
  id: string;
  username: string;
  displayName: string | null;
  /** Whether their map is shared. When false, `courseCount` is 0 (RLS-gated). */
  isShared: boolean;
  shareSlug: string | null;
  /** Count of their entries readable to us via the follower-gated read path. */
  courseCount: number;
  /** Stable per-friend color (follow order), shared by the sidebar + map pins. */
  color: string;
};

/**
 * A friend's map as an overlay layer: their readable (shared + followed) course
 * entries, plus the identity used to label and color their pins. Only friends
 * with at least one visible course become overlays.
 */
export type FriendOverlay = {
  id: string;
  name: string;
  username: string;
  color: string;
  entries: CourseEntry[];
};
