"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followByUsername, unfollow } from "@/app/map/follow-actions";
import { USERNAME_MAX } from "@/lib/profile";
import { type Friend } from "@/lib/follow";

/**
 * Friends panel: follow a member by @username, then see everyone you follow.
 * Each row shows how many of their courses you can see (RLS follower-gated) and
 * links to their public map when shared; a private map shows no count. Mirrors
 * the ProfileBar/CourseList inline-action pattern (server action → refresh).
 */
export function FriendsBar({ friends }: { friends: Friend[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  function handleFollow() {
    setError("");
    const value = username.trim();
    if (!value) return;
    startTransition(async () => {
      const result = await followByUsername(value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUsername("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleFollow();
        }}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-md border border-[var(--line)] bg-[var(--paper)] focus-within:border-[var(--brass)]">
            <span className="pl-2 text-sm text-[var(--ink-muted)]">@</span>
            <input
              type="text"
              value={username}
              maxLength={USERNAME_MAX}
              placeholder="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-transparent px-1 py-1.5 text-sm text-[var(--ink)] outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={pending || username.trim().length === 0}
            className="shrink-0 rounded-md bg-[var(--forest)] px-3 py-1.5 text-xs font-medium text-[var(--paper)] transition-colors hover:bg-[var(--forest-mid)] disabled:opacity-50"
          >
            {pending ? "Following…" : "Follow"}
          </button>
        </div>
        {error && <p className="text-xs text-[var(--oxblood)]">{error}</p>}
      </form>

      {friends.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--line)] px-4 py-6 text-center">
          <p className="font-[family-name:var(--font-display)] text-[15px] text-[var(--ink)]">
            No friends yet.
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Follow a friend by their @username to overlay their map.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {friends.map((friend) => (
            <FriendItem key={friend.id} friend={friend} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FriendItem({ friend }: { friend: Friend }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const name = friend.displayName?.trim() || friend.username;
  const slug = friend.shareSlug ?? friend.username;

  function handleUnfollow() {
    setError("");
    startTransition(async () => {
      const result = await unfollow(friend.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {/* Color dot matches this friend's pins on the map overlay. */}
          <span
            aria-hidden
            className="mt-1.5 size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: friend.color }}
          />
          <div className="min-w-0">
            <p className="truncate font-[family-name:var(--font-display)] text-[17px] font-medium leading-snug text-[var(--ink)]">
              {name}
            </p>
            <p className="truncate font-[family-name:var(--font-mono)] text-xs text-[var(--ink-muted)]">
              @{friend.username}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleUnfollow}
          disabled={pending}
          className="shrink-0 text-xs text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--oxblood)] hover:underline disabled:opacity-50"
          aria-label={`Unfollow ${name}`}
        >
          {pending ? "Unfollowing…" : "Unfollow"}
        </button>
      </div>

      <div className="mt-1 flex items-center gap-2 text-xs">
        {friend.isShared ? (
          <a
            href={`/u/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="font-[family-name:var(--font-mono)] text-[var(--brass-deep)] underline-offset-2 hover:underline"
          >
            {friend.courseCount}{" "}
            {friend.courseCount === 1 ? "course" : "courses"} →
          </a>
        ) : (
          <span className="font-[family-name:var(--font-mono)] text-[var(--ink-muted)]">
            Map is private
          </span>
        )}
      </div>

      {error && <p className="mt-1.5 text-xs text-[var(--oxblood)]">{error}</p>}
    </li>
  );
}
