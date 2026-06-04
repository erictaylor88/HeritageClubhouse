import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bootstrapProfile } from "@/lib/auth/bootstrap-profile";

/**
 * PKCE `?code=` exchange. Retained for OAuth and same-browser flows. Note
 * this REQUIRES the `code_verifier` cookie set in the browser that started
 * the flow, so it fails when a link is opened in a different browser/app.
 * Magic links route through ./confirm (verifyOtp) instead, which has no
 * such requirement.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/map";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      await bootstrapProfile(supabase);

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("[auth/callback] exchangeCodeForSession failed", {
      status: error.status,
      message: error.message,
    });
  } else {
    console.error("[auth/callback] missing code param");
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
