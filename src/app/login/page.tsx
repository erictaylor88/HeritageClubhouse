"use client";

import { useState } from "react";
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
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

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

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
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
            <div className="rounded-md border border-[var(--line)] bg-[var(--paper-sunk)] p-4 text-sm text-[var(--ink)]">
              Check <span className="font-medium">{email}</span> for your sign-in
              link. You can close this tab once you&apos;ve opened it.
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
