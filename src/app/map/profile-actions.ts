"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  validateDisplayName,
  validateShareSlug,
  validateUsername,
} from "@/lib/profile";

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
 * Set a custom public-link slug (`/u/[slug]`).
 *
 * `share_slug` is a separate, stable field — seeded from the username on first
 * share but never auto-clobbered — so a user can pick a custom link without it
 * changing every time they rename. We re-fetch the old slug to revalidate its
 * cached page when it changes. Uniqueness is DB-enforced (`profiles_share_slug`
 * unique); we map the unique-violation (23505) to a friendly message. RLS
 * (`profiles_update`, `id = auth.uid()`) enforces ownership; the explicit `id`
 * filter is defense-in-depth.
 */
export async function updateShareSlug(slug: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const parsed = validateShareSlug(slug);
  if (!parsed.ok) return parsed;

  const { data: current } = await supabase
    .from("profiles")
    .select("share_slug")
    .eq("id", user.id)
    .maybeSingle();

  // No-op if unchanged — avoids a needless write and a spurious "taken" if the
  // user re-saves their own current slug.
  if (current?.share_slug === parsed.value) return { ok: true };

  const { error } = await supabase
    .from("profiles")
    .update({ share_slug: parsed.value, updated_at: new Date().toISOString() })
    .eq("id", user.id); // defense-in-depth; RLS already enforces ownership

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "That link is already taken." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/map");
  if (current?.share_slug) revalidatePath(`/u/${current.share_slug}`);
  revalidatePath(`/u/${parsed.value}`);
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
