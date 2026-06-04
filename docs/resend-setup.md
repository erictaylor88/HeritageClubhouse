# Resend → Supabase magic-link email — setup runbook

Heritage Clubhouse sends magic-link sign-in emails through **Supabase Auth**.
By default Supabase uses its built-in sender, which is rate-limited (~a few
emails/hour) and meant only for testing. This wires **Resend** as the custom
SMTP provider so delivery is reliable and the email is on-brand.

**Current mode: test-only.** We send from Resend's shared `onboarding@resend.dev`
sender, which only delivers to *your own Resend account email*. That's enough to
prove the pipeline and sign in as yourself. To email anyone else (friends), you
must verify a sending domain first — see [Going live](#going-live-real-sending).

No application code is involved — this is all configuration plus the branded
template in [`docs/email/magic-link.html`](./email/magic-link.html).

---

## 1. Get a Resend API key

1. Sign in at [resend.com](https://resend.com) (the account email you use here is
   the only address that can receive test emails).
2. **API Keys → Create API Key.** Name it `heritage-clubhouse`, permission
   **Sending access**. Copy the `re_…` key (shown once).

> The key is the SMTP **password** below. It lives only in Supabase's SMTP
> settings — not in Vercel, not in the repo. (The `RESEND_API_KEY` env var noted
> in CLAUDE.md is only needed if we later switch to the code-based Send-Email
> hook; with SMTP it isn't used.)

## 2. Point Supabase Auth at Resend (custom SMTP)

Supabase Dashboard → **Project Settings → Authentication → SMTP Settings** →
enable **Custom SMTP**:

| Field | Value |
|---|---|
| Sender email | `onboarding@resend.dev` |
| Sender name | `Heritage Clubhouse` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your `re_…` API key |

Save. (Once a domain is verified in Resend, change **Sender email** to an address
on that domain — e.g. `clubhouse@yourdomain` — and you can email anyone.)

## 3. Set the URL configuration

Dashboard → **Authentication → URL Configuration**. The magic link only redirects
to allow-listed URLs; otherwise it falls back to the Site URL.

- **Site URL:** `https://heritageclubhouse.app` once the custom domain is live on
  Vercel (see [Going live](#going-live-real-sending)); until then keep
  `https://heritage-clubhouse.vercel.app`.
- **Redirect URLs** (add all that apply):
  - `https://heritageclubhouse.app/**` (custom domain)
  - `https://heritage-clubhouse.vercel.app/**` (Vercel default — keep as fallback)
  - `http://localhost:3000/**` (local dev)

The app requests `emailRedirectTo = <origin>/auth/callback` (see
[`src/app/login/page.tsx`](../src/app/login/page.tsx)); these entries authorize it.

## 4. Brand the emails (TWO templates)

`signInWithOtp` sends a **different template depending on whether the email is
new or returning**, so brand both — otherwise first-time users get the default
unbranded "Confirm signup" email:

| Supabase template | Fires for | Paste |
|---|---|---|
| **Confirm signup** | a brand-new email (first login) | [`docs/email/confirm-signup.html`](./email/confirm-signup.html) |
| **Magic Link** | a returning user | [`docs/email/magic-link.html`](./email/magic-link.html) |

Dashboard → **Authentication → Email Templates** → for each, replace the
**Message body** and set a **Subject**:
- Confirm signup → `Confirm your email — Heritage Clubhouse`
- Magic Link → `Your Heritage Clubhouse sign-in link`

Keep the `{{ .ConfirmationURL }}` token intact — Supabase substitutes the
one-time link at send time. (Both also support `{{ .Token }}`, `{{ .SiteURL }}`,
`{{ .Email }}`, `{{ .RedirectTo }}`.)

> Tip: to see the branded Magic Link email yourself, you'd need to sign in as a
> *returning* user — i.e. after your first (signup) login.

## 5. Test

1. Open the production site → **Send magic link** to your Resend-account email.
2. Confirm: the email arrives from "Heritage Clubhouse", renders branded, and the
   button signs you in and lands on `/map`.
3. Cross-check in Resend → **Emails** (delivery log) and Supabase → **Auth Logs**
   if anything doesn't arrive.

---

## Going live (real sending) — `heritageclubhouse.app`

**Decided:** the go-live sending domain is **`heritageclubhouse.app`**, purchased
through Vercel so its DNS is managed in the Vercel dashboard (no third-party
registrar). The same domain doubles as the app's custom URL. Steps, in order:

1. **Buy + attach the domain (Vercel).**
   - Vercel → **Domains → buy `heritageclubhouse.app`** (~$9.99/yr). `.app` is
     HTTPS-only (HSTS preload) — Vercel auto-provisions the TLS cert.
   - `heritage-clubhouse` project → **Settings → Domains → Add** `heritageclubhouse.app`
     (and `www` if wanted). Set it as the **primary** domain. Because every app URL
     is origin-relative, share links and auth redirects inherit it automatically —
     no code change.
2. **Verify the domain in Resend.**
   - Resend → **Domains → Add Domain** → `heritageclubhouse.app`.
   - Resend shows **SPF / DKIM (and DMARC)** records. Add each one in **Vercel →
     the domain → DNS** (since Vercel manages this domain's DNS). Wait for Resend to
     mark it **Verified**.
3. **Switch the sender (Supabase).**
   - SMTP settings → change **Sender email** from `onboarding@resend.dev` to
     `clubhouse@heritageclubhouse.app`.
4. **Repoint auth URLs (Supabase).**
   - Authentication → URL Configuration → set **Site URL** to
     `https://heritageclubhouse.app` and confirm the `https://heritageclubhouse.app/**`
     redirect from §3 is present.
5. **Re-test** by emailing a **non-account** address (a friend, or a second inbox of
   yours). It should arrive from `clubhouse@heritageclubhouse.app`, render branded,
   and sign in to `https://heritageclubhouse.app/map`.

Until step 3 is done, only your Resend-account email (`eric@taylorgrowthconsulting.com`)
receives magic links.
