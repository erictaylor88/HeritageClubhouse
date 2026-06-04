import { ImageResponse } from "next/og";

// Generated favicon — the passport-stamp monogram mark from the share OG card,
// reduced to a tab-legible tile: forest fill + brass frame + cream "HC". A
// filled tile (not the OG's outlined-on-paper stamp) so it survives against
// white/dark browser chrome where a cream stamp would wash out.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// The Logbook palette (kept inline — satori has no access to CSS variables).
const PAPER = "#faf6ec";
const FOREST = "#1f4d2e";
const BRASS = "#b08d4f";

/**
 * Fetch Fraunces as a TTF ArrayBuffer for satori (mirrors opengraph-image.tsx).
 * Subset to "HC" — the only glyphs drawn. Returns null on any failure so the
 * mark falls back to satori's default font rather than breaking the build.
 */
async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Fraunces:wght@600&text=${encodeURIComponent(
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

export default async function Icon() {
  const fraunces = await loadFont("HC");
  const serif = fraunces ? { fontFamily: "Fraunces" } : {};

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: FOREST,
          borderRadius: 7,
          border: `1.5px solid ${BRASS}`,
        }}
      >
        <div
          style={{
            display: "flex",
            color: PAPER,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: -0.5,
            ...serif,
          }}
        >
          HC
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
