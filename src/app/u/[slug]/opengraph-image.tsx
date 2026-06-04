import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";

// A shared map turned private must not leak a real OG card; always re-query.
export const dynamic = "force-dynamic";

export const alt = "A shared golf passport on Heritage Clubhouse";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The Logbook palette (kept inline — satori has no access to CSS variables).
const PAPER = "#faf6ec";
const PAPER_SUNK = "#f1e9d6";
const INK = "#20241e";
const INK_MUTED = "#5c5848";
const FOREST = "#1f4d2e";
const BRASS = "#b08d4f";
const BRASS_DEEP = "#8a6d3b";
const LINE = "#d9cfb8";

/**
 * Fetch a Google font as a TTF ArrayBuffer for satori. The css2 endpoint serves
 * truetype (not woff2, which satori can't read) to non-browser clients; we match
 * that URL out of the returned CSS. Subset to `text` to keep the payload small.
 * Returns null on any failure so the card falls back to satori's default font.
 */
async function loadFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(
      text,
    )}`;
    const css = await (await fetch(url)).text();
    const src = css.match(
      /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/,
    );
    if (!src) return null;
    const res = await fetch(src[1]);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

type Shared = { name: string; courseCount: number } | null;

async function getShared(slug: string): Promise<Shared> {
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id, username, display_name")
      .eq("share_slug", slug.toLowerCase())
      .eq("is_shared", true)
      .maybeSingle();
    if (!profile) return null;

    const { count } = await admin
      .from("course_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id);

    return {
      name: profile.display_name?.trim() || profile.username,
      courseCount: count ?? 0,
    };
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shared = await getShared(slug);

  // Generic, non-identifying card when the slug isn't a live shared map.
  const title = shared ? `${shared.name}'s Clubhouse` : "Heritage Clubhouse";
  const subtitle = shared
    ? shared.courseCount === 1
      ? "1 course on the map"
      : `${shared.courseCount} courses on the map`
    : "A personal golf passport";

  // One serif for the whole card (on-brand editorial Logbook look). Subset to a
  // full ASCII range + the dynamic title so every glyph drawn is covered — an
  // incomplete subset makes satori fall back per-glyph and mix fonts mid-word.
  const serifText =
    title +
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,'’&-—";
  const fraunces = await loadFont("Fraunces", 600, serifText);
  const serif = fraunces ? { fontFamily: "Fraunces" } : {};

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          backgroundColor: PAPER,
          backgroundImage: `radial-gradient(circle at 18% 22%, ${PAPER_SUNK} 0%, ${PAPER} 45%)`,
          padding: 64,
        }}
      >
        {/* Brass inset frame */}
        <div
          style={{
            position: "absolute",
            top: 28,
            left: 28,
            right: 28,
            bottom: 28,
            border: `2px solid ${BRASS}`,
            borderRadius: 14,
            display: "flex",
          }}
        />

        {/* Passport-stamp motif, top-right */}
        <div
          style={{
            position: "absolute",
            top: 92,
            right: 96,
            width: 132,
            height: 132,
            borderRadius: 999,
            border: `4px solid ${BRASS}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: "rotate(-9deg)",
            opacity: 0.85,
          }}
        >
          <div
            style={{
              width: 104,
              height: 104,
              borderRadius: 999,
              border: `2px solid ${BRASS_DEEP}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: FOREST,
              fontSize: 44,
              fontWeight: 700,
              ...serif,
            }}
          >
            HC
          </div>
        </div>

        {/* Eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: BRASS_DEEP,
            fontSize: 24,
            letterSpacing: 8,
            textTransform: "uppercase",
            ...serif,
          }}
        >
          Heritage Clubhouse
        </div>

        {/* Spacer */}
        <div style={{ display: "flex", flexGrow: 1 }} />

        {/* Title block */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontSize: 84,
              lineHeight: 1.04,
              fontWeight: 600,
              color: INK,
              maxWidth: 940,
              ...serif,
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 34,
              color: INK_MUTED,
              ...serif,
            }}
          >
            {subtitle}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 40,
            paddingTop: 24,
            borderTop: `1px solid ${LINE}`,
            color: FOREST,
            fontSize: 26,
            fontWeight: 600,
            ...serif,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              backgroundColor: FOREST,
              display: "flex",
            }}
          />
          heritageclubhouse.app
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fraunces
        ? [{ name: "Fraunces", data: fraunces, weight: 600, style: "normal" }]
        : [],
    },
  );
}
