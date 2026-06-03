<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (16.x) has breaking changes — APIs, conventions, and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Notably: `middleware.ts` is now `proxy.ts`; `cookies()`, `headers()`, and dynamic
route `params` are async (`await` them).
<!-- END:nextjs-agent-rules -->

# Heritage Clubhouse — agent rules

## Git identity (MANDATORY before any commit)
Vercel auto-deploys silently fail when the git author email doesn't match the
repo owner. Always set, once per session:

```bash
git config user.name "Eric Taylor"
git config user.email "eric@taylorgrowthconsulting.com"
```

## Hard rules
1. RLS on every table. No anon read policy on user tables. The public share page
   reads server-side via the service role, gated by `is_shared`.
2. Secrets stay server-side. `SUPABASE_SERVICE_ROLE_KEY` and `GOLFCOURSE_API_KEY`
   live only in server code + Vercel env. Never `NEXT_PUBLIC_*`, never committed.
3. All course coordinate writes go through the `course_cache` write-through.
   The client never calls GolfCourseAPI directly. Respect the 50 req/day cap.
4. Status enum is fixed: `played | upcoming | bucket_list`.
5. Supabase DDL goes through migrations (`apply_migration`), never ad-hoc SQL.
   Run security + performance advisors after every migration.

## Stack
Next.js 16 (App Router) · React 19 · TS · Tailwind v4 · shadcn/ui ·
@supabase/ssr (Postgres + magic-link auth + RLS) · Leaflet (P1) · Vercel.
