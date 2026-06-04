"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("sent");
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setCodeError("");

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });

    if (error) {
      setVerifying(false);
      setCodeError("That code didn't match. Check it and try again.");
      return;
    }
    router.push("/map");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="hc-grain w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-[var(--forest)]">
            Open your Clubhouse
          </CardTitle>
          <CardDescription>
            We&apos;ll email you a magic link — no password to remember.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "sent" ? (
            <div className="flex flex-col gap-5">
              <div className="rounded-md border border-[var(--line)] bg-[var(--paper-sunk)] p-4 text-sm text-[var(--ink)]">
                Check <span className="font-medium">{email}</span>{" "}
                for your sign-in link. You can close this tab once you&apos;ve
                opened it.
              </div>

              <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="code">Or enter the 6-digit code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, ""))
                    }
                    disabled={verifying}
                  />
                  <p className="text-xs text-[var(--ink-muted)]">
                    The same email includes a code — handy if the link opens in
                    the wrong browser.
                  </p>
                </div>
                {codeError && (
                  <p className="text-sm text-[var(--oxblood)]">{codeError}</p>
                )}
                <Button
                  type="submit"
                  disabled={verifying || code.length < 6}
                >
                  {verifying ? "Verifying…" : "Sign in with code"}
                </Button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "sending"}
                />
              </div>
              {status === "error" && (
                <p className="text-sm text-[var(--oxblood)]">{message}</p>
              )}
              <Button type="submit" disabled={status === "sending" || !email}>
                {status === "sending" ? "Sending…" : "Send magic link"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
