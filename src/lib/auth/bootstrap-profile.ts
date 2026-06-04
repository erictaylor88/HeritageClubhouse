import type { createClient } from "@/lib/supabase/server";

/** Create a profiles row on first login. Username is provisional + unique;
 *  the user can claim a real one in the P2 profile flow. Safe to call on every
 *  sign-in — it no-ops if the profile already exists. */
export async function bootstrapProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) return;

  const emailLocal =
    (user.email ?? "golfer")
      .split("@")[0]
      .replace(/[^a-zA-Z0-9_]/g, "")
      .toLowerCase() || "golfer";
  const username = `${emailLocal}_${user.id.slice(0, 8)}`;

  await supabase.from("profiles").insert({
    id: user.id,
    username,
    display_name: emailLocal,
  });
}
