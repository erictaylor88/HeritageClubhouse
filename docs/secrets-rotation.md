# Secrets rotation runbook (hygiene)

Three secrets were pasted in plaintext during setup and should be rotated so the
exposed values stop working. None of these live in the repo — they live in **Vercel
env** (server-only) and the respective provider dashboards. Rotating them needs no
code change: the **env var names stay the same**, only their values change.

Project: Supabase `pcwpjdxpmgvlzefycbrb` · Vercel project `heritage-clubhouse` (team tgc).

Pattern for each: **mint new → update where stored → redeploy → verify → revoke old.**

---

## 1. Supabase service-role key  (`SUPABASE_SERVICE_ROLE_KEY`)

Used server-side only (public share route + `course_cache` write-through admin client).

This project **already has the modern API key system on** (`sb_publishable_…` exists),
so prefer the modern path — the new secret key is independently rotatable, unlike the
legacy `service_role` JWT (whose only "rotation" is rolling the JWT secret, which also
invalidates the anon key).

**Recommended (modern, retires the exposed key for good):**
1. Supabase → **Project Settings → API Keys → Secret keys → Create new secret key**
   (`sb_secret_…`). Copy it once.
2. Vercel → `heritage-clubhouse` → **Settings → Environment Variables** → set
   `SUPABASE_SERVICE_ROLE_KEY` to the new `sb_secret_…` value (Production).
3. Redeploy (env changes only take effect on a new deployment).
4. Verify the share page (`/u/eric`) and adding a course (cache write-through) still
   work in prod.
5. **Revoke** the exposed key. If you want to fully retire legacy JWT keys, also do §1b
   first, then disable the legacy keys.

**1b. (Optional) Rotate the anon key too** — it's RLS-protected so exposure is
low-risk, but to fully disable legacy keys: set `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the
`sb_publishable_…` key in Vercel, redeploy, verify login, then Supabase → API Keys →
**disable legacy keys**.

> Lighter alternative (not recommended): Project Settings → API → **roll the JWT
> secret**. This rotates `anon` **and** `service_role` at once, so you must update both
> env vars together and redeploy. More disruptive than the modern path above.

## 2. GolfCourseAPI key  (`GOLFCOURSE_API_KEY`)

Used server-side only (`/api/courses/*` proxy).
1. GolfCourseAPI dashboard → **regenerate / create a new key**, revoke the old one.
2. Vercel → set `GOLFCOURSE_API_KEY` to the new value (Production).
3. Redeploy → verify search-as-you-type returns results in prod (proves the proxy key).

## 3. GitHub PAT

Used for git auth (push). Not in Vercel env.
1. GitHub → **Settings → Developer settings → Personal access tokens** → **revoke** the
   exposed token.
2. Generate a replacement (fine-grained, scoped to this repo, `contents: read/write`)
   **only if** a PAT is actually needed — if you push over SSH or the `gh` CLI's own
   auth, you may not need a PAT at all.
3. Update wherever it was stored (macOS Keychain / git credential helper / `gh auth`).

---

## After rotating

- Confirm the next Vercel deploy is green (wrong/empty env values fail at runtime, not
  build — so exercise the share page + add-course paths).
- These secrets should now exist **only** in Vercel env + the provider dashboards +
  your password manager. Never in the repo, never `NEXT_PUBLIC_*` for the server-only
  ones (`SUPABASE_SERVICE_ROLE_KEY`, `GOLFCOURSE_API_KEY`).
