# Heritage Clubhouse

A web-based **golf passport** — a personal, map-forward record of the courses you've
played, the rounds you have coming up, and your bucket list, with an opt-in social layer
to share your map publicly and overlay friends' maps onto your own.

🔗 **Live:** [heritageclubhouse.app](https://heritageclubhouse.app) · example shared map: [/u/eric](https://heritageclubhouse.app/u/eric)

> A polished portfolio piece built for a small circle of golfing friends — not a
> commercial product. The emphasis is on a warm, premium feel over scale.

## Features

- **Interactive map** of your courses with passport-stamp pins, status-colored
  (played / upcoming / bucket list).
- **Add courses** via live search, written through a server-side cache of the
  GolfCourseAPI so coordinates are fetched once and reused.
- **Per-entry details** — date played, best score, and notes, edited inline.
- **Magic-link auth** — no passwords; multi-user from day one.
- **Public share pages** — opt in to publish your map at a custom link, with branded
  social (Open Graph) preview cards generated per map.
- **Follow friends** and overlay their shared maps as distinct "guest stamps."

## Tech stack

- **Next.js (App Router)** + **React** + **TypeScript** — frontend and server route handlers.
- **Tailwind CSS** + **shadcn/ui** — UI layer.
- **Leaflet** / **react-leaflet** — the interactive map and stamp pins.
- **Supabase** — Postgres, magic-link auth, and row-level security.
- **GolfCourseAPI** — course search and detail, proxied and cached server-side.
- **Resend** — production magic-link email.
- **Vercel** — hosting and CI.

## Architecture

Multi-user and RLS-enforced from the start. Four tables — `profiles`, `course_cache`,
`course_entries`, `follows`. Course coordinates live **once** in `course_cache` (a
write-through cache of the GolfCourseAPI); entries join to it rather than duplicating
location data. Your own entries are owner-read/write; friends' entries are readable
in-app only through a follower-gated RLS policy (the owner shares **and** the viewer
follows). The public share page is rendered server-side with the service role and gated
by an `is_shared` flag — user tables are never exposed to the anonymous key.

Database schema and policies are version-controlled as migrations under
[`supabase/migrations/`](supabase/migrations).

## Design

**The Logbook** — a restrained, editorial heritage aesthetic: warm cream paper, forest
green, and brass, with passport-stamp pins as the signature flourish. Map-forward and
content-light.

## Local development

```bash
git clone https://github.com/erictaylor88/HeritageClubhouse.git
cd HeritageClubhouse
npm install

# Configure environment (see .env.example for the full list)
cp .env.example .env.local
# Fill in your own Supabase, GolfCourseAPI, and Resend values

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

All secrets are server-side and live in environment variables only — never in the repo.
The GolfCourseAPI free tier is rate-limited (50 requests/day), which is why all course
data flows through the server-side cache and the API is never called from the client.
