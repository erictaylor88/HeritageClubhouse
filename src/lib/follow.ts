/**
 * Shared follow/friend types (no server-only deps — safe to import into client
 * components). The follow model is auto-accept: following someone is a single
 * insert into `follows`, no pending/approval state. Reading a friend's courses
 * is gated by RLS (`entries_follower_read`): the owner must have `is_shared`
 * AND the viewer must follow them.
 */

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
};
