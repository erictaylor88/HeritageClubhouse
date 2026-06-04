import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bootstrapProfile } from "@/lib/auth/bootstrap-profile";

/**
 * Magic-link landing route. Unlike the PKCE `?code=` exchange (see
 * ./callback), `verifyOtp` validates the emailed `token_hash` entirely
 * server-side — it does NOT need the `code_verifier` cookie set by the
 * browser that requested the link. That makes it robust when the link is
 * opened in a different browser/app than it was requested from (e.g. tapping
 * it from the Gmail app on mobile). This is the route the email template
 * should point at.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/map";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      await bootstrapProfile(supabase);
      return redirectTo(request, origin, next);
    }

    console.error("[auth/confirm] verifyOtp failed", {
      type,
      status: error.status,
      message: error.message,
    });
  } else {
    console.error("[auth/confirm] missing params", {
      hasTokenHash: Boolean(token_hash),
      type,
    });
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}

function redirectTo(request: Request, origin: string, next: string) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  if (!isLocalEnv && forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
