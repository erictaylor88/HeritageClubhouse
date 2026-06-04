"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateUsername } from "@/lib/profile";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Follow another member by their username (auto-accept — no pending state).
 *
 * Looks up the target via the username (readable: `profiles_read` is `true` for
 * authenticated), then inserts a `follows` row. RLS (`follows_owner_all`,
 * `follower_id = auth.uid()`) enforces that you can only create your own
 * follows; the DB also guards self-follows (`CHECK follower_id <> followee_id`)
 * and dedupes (PK on `follower_id, followee_id`). We map a duplicate (23505) to
 * success so following twice is idempotent, and friendly-guard the self-follow
 * before hitting the DB.
 */
export async function followByUsername(
  rawUsername: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const uname = validateUsername(rawUsername);
  if (!uname.ok) return uname;

  const { data: target } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", uname.value)
    .maybeSingle();
  if (!target) {
    return { ok: false, error: `No member found with the username @${uname.value}.` };
  }
  if (target.id === user.id) {
    return { ok: false, error: "You can't follow yourself." };
  }

  const { error } = await supabase
    .from("follows")
    .insert({ follower_id: user.id, followee_id: target.id });

  if (error) {
    if (error.code === "23505") return { ok: true }; // already following — idempotent
    return { ok: false, error: error.message };
  }

  revalidatePath("/map");
  return { ok: true };
}

/** Stop following a member. RLS scopes the delete to the signed-in follower. */
export async function unfollow(followeeId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };
  if (!followeeId) return { ok: false, error: "Missing member." };

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id) // defense-in-depth; RLS already enforces ownership
    .eq("followee_id", followeeId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/map");
  return { ok: true };
}
