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

- **Site URL:** `https://heritage-clubhouse.vercel.app`
- **Redirect URLs** (add both):
  - `https://heritage-clubhouse.vercel.app/**`
  - `http://localhost:3000/**` (local dev)

The app requests `emailRedirectTo = <origin>/auth/callback` (see
[`src/app/login/page.tsx`](../src/app/login/page.tsx)); these entries authorize it.

## 4. Brand the email

Dashboard → **Authentication → Email Templates → Magic Link**. Replace the
**Message body** with the contents of
[`docs/email/magic-link.html`](./email/magic-link.html). Suggested **Subject**:
`Your Heritage Clubhouse sign-in link`.

Keep the `{{ .ConfirmationURL }}` token intact — Supabase substitutes the
one-time link at send time. (Magic Link also supports `{{ .Token }}`,
`{{ .SiteURL }}`, `{{ .Email }}`, `{{ .RedirectTo }}`.)

## 5. Test

1. Open the production site → **Send magic link** to your Resend-account email.
2. Confirm: the email arrives from "Heritage Clubhouse", renders branded, and the
   button signs you in and lands on `/map`.
3. Cross-check in Resend → **Emails** (delivery log) and Supabase → **Auth Logs**
   if anything doesn't arrive.

---

## Going live (real sending)

Test mode can't email friends. When ready:

1. **Resend → Domains → Add Domain** (e.g. `taylorgrowthconsulting.com` or a
   dedicated Heritage domain). Add the shown **SPF/DKIM (and DMARC)** DNS records
   at your registrar; wait for Resend to mark it **Verified**.
2. In Supabase SMTP settings, change **Sender email** to an address on that
   verified domain.
3. Re-test by emailing a non-account address.

Until then, only your own account email will receive magic links.
