"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile, updateSharing } from "@/app/map/profile-actions";
import {
  DISPLAY_NAME_MAX,
  USERNAME_MAX,
  type Profile,
} from "@/lib/profile";

/**
 * Welcome line + inline profile editor. Mirrors the course-list edit pattern:
 * a text "Edit" toggle reveals an inline form, the server action validates, and
 * we `router.refresh()` to re-render the server component on success.
 */
export function ProfileBar({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");

  const greeting = profile.displayName?.trim() || profile.username;

  function startEdit() {
    setUsername(profile.username);
    setDisplayName(profile.displayName ?? "");
    setError("");
    setEditing(true);
  }

  function handleSave() {
    setError("");
    startTransition(async () => {
      const result = await updateProfile({
        username,
        displayName: displayName.trim() ? displayName : null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          Welcome, {greeting}
        </p>
        <button
          type="button"
          onClick={() => (editing ? setEditing(false) : startEdit())}
          disabled={pending}
          className="shrink-0 text-xs text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--brass-deep)] hover:underline disabled:opacity-50"
        >
          {editing ? "Close" : "Edit profile"}
        </button>
      </div>

      {!editing && (
        <p className="mt-0.5 font-[family-name:var(--font-mono)] text-xs text-[var(--ink-muted)]">
          @{profile.username}
        </p>
      )}

      {!editing && <SharingControl profile={profile} />}

      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="mt-3 flex flex-col gap-3 border-t border-[var(--line)] pt-3"
        >
          <label className="flex flex-col gap-1">
            <span className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Username
            </span>
            <div className="flex items-center rounded-md border border-[var(--line)] bg-[var(--paper)] focus-within:border-[var(--brass)]">
              <span className="pl-2 text-sm text-[var(--ink-muted)]">@</span>
              <input
                type="text"
                value={username}
                maxLength={USERNAME_MAX}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-transparent px-1 py-1 text-sm text-[var(--ink)] outline-none"
              />
            </div>
            <span className="text-[0.7rem] text-[var(--ink-muted)]">
              Lowercase letters, numbers, and underscores. Also your public
              share link: /u/{username.trim().toLowerCase() || "username"}
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Display name
            </span>
            <input
              type="text"
              value={displayName}
              maxLength={DISPLAY_NAME_MAX}
              placeholder="Optional — how your name reads"
              onChange={(e) => setDisplayName(e.target.value)}
              className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--brass)]"
            />
          </label>

          {error && <p className="text-xs text-[var(--oxblood)]">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--forest)] px-3 py-1.5 text-xs font-medium text-[var(--paper)] transition-colors hover:bg-[var(--forest-mid)] disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition-colors hover:bg-[var(--paper-sunk)] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * Public-sharing toggle. Flipping this is the only switch that exposes the map
 * at `/u/[slug]` (the share route reads via the service role gated by
 * `is_shared`). When on, shows the public link with copy-to-clipboard.
 */
function SharingControl({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // The slug is seeded from the username on first enable; until then, preview it.
  const slug = profile.shareSlug ?? profile.username;
  const path = `/u/${slug}`;

  function toggle() {
    setError("");
    startTransition(async () => {
      const result = await updateSharing(!profile.isShared);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy — copy the link manually.");
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-[var(--line)] pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          Public map
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={profile.isShared}
          aria-label="Share my map publicly"
          onClick={toggle}
          disabled={pending}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
            profile.isShared
              ? "border-[var(--forest)] bg-[var(--forest)]"
              : "border-[var(--line)] bg-[var(--paper-sunk)]"
          }`}
        >
          <span
            className={`inline-block size-3.5 rounded-full bg-[var(--paper)] shadow-sm transition-transform ${
              profile.isShared ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {profile.isShared ? (
        <div className="flex items-center gap-2">
          <a
            href={path}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 truncate font-[family-name:var(--font-mono)] text-xs text-[var(--brass-deep)] underline-offset-2 hover:underline"
          >
            {path}
          </a>
          <button
            type="button"
            onClick={copyLink}
            className="shrink-0 text-xs text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--brass-deep)] hover:underline"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        <p className="text-[0.7rem] text-[var(--ink-muted)]">
          Off — your map is private. Turn on to share it at {path}.
        </p>
      )}

      {error && <p className="text-xs text-[var(--oxblood)]">{error}</p>}
    </div>
  );
}
