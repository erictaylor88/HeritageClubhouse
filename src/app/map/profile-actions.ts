"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateDisplayName, validateUsername } from "@/lib/profile";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Update the signed-in user's username + display name.
 *
 * The username doubles as the public share slug (`/u/[slug]`), so when the
 * profile has no slug yet we seed `share_slug` from the new username — but we
 * never clobber an existing slug (leaving room for a custom one later). RLS
 * (`profiles_update`, `id = auth.uid()`) enforces ownership; the explicit
 * `id` filter is defense-in-depth. Uniqueness is enforced by the DB; we map the
 * unique-violation (23505) to a friendly message.
 */
export async function updateProfile(input: {
  username: string;
  displayName: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const uname = validateUsername(input.username);
  if (!uname.ok) return uname;

  const dname = validateDisplayName(input.displayName);
  if (!dname.ok) return dname;

  // Seed share_slug from the username only if one isn't set yet.
  const { data: current } = await supabase
    .from("profiles")
    .select("share_slug")
    .eq("id", user.id)
    .maybeSingle();

  const patch: {
    username: string;
    display_name: string | null;
    updated_at: string;
    share_slug?: string;
  } = {
    username: uname.value,
    display_name: dname.value,
    updated_at: new Date().toISOString(),
  };
  if (!current?.share_slug) patch.share_slug = uname.value;

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id); // defense-in-depth; RLS already enforces ownership

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "That username is already taken." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/map");
  return { ok: true };
}

/**
 * Toggle whether the signed-in user's map is publicly shared at `/u/[slug]`.
 *
 * Turning sharing ON requires a slug; if none exists yet we seed it from the
 * username (always present — NOT NULL). The public share route reads via the
 * service role gated by `is_shared`, so flipping this is the only switch that
 * exposes the map. RLS (`profiles_update`) enforces ownership.
 */
export async function updateSharing(isShared: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, share_slug")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return { ok: false, error: "Profile not found." };

  const patch: { is_shared: boolean; updated_at: string; share_slug?: string } = {
    is_shared: isShared,
    updated_at: new Date().toISOString(),
  };
  if (isShared && !profile.share_slug) patch.share_slug = profile.username;

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id); // defense-in-depth; RLS already enforces ownership

  if (error) return { ok: false, error: error.message };

  revalidatePath("/map");
  if (patch.share_slug ?? profile.share_slug) {
    revalidatePath(`/u/${patch.share_slug ?? profile.share_slug}`);
  }
  return { ok: true };
}
