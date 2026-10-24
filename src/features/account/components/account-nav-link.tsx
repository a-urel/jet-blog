"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRound } from "lucide-react";

import { IdentityAvatar } from "@/features/avatars/components/identity-avatar";
import { avatarChangedEvent } from "@/features/avatars/events";
import { createBrowserAuthSupabaseClient } from "@/lib/supabase/client";

type Viewer = { avatarId: string | null; name: string };

// The header link to /account. Public pages are prerendered and shared by
// every visitor, so the server renders a generic icon; after hydration the
// browser reads the visitor's own profile (RLS limits it to their row) and
// shows their avatar or initials. The session check only picks what to draw:
// /account verifies the user on the server and sends signed-out visitors to
// /login. The read repeats on navigation (sign-in and sign-out redirect) and
// after an avatar change.
export function AccountNavLink({ label }: { label: string }) {
  const pathname = usePathname();
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    const reload = () => setReloads((count) => count + 1);
    window.addEventListener(avatarChangedEvent, reload);
    return () => window.removeEventListener(avatarChangedEvent, reload);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createBrowserAuthSupabaseClient();
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;

        if (!user) {
          if (!cancelled) setViewer(null);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_id")
          .eq("id", user.id)
          .maybeSingle();

        if (cancelled) return;

        setViewer({
          avatarId: (profile?.avatar_id as string | null | undefined) ?? null,
          name: (profile?.display_name as string | null | undefined) ?? user.email ?? "?",
        });
      } catch {
        if (!cancelled) setViewer(null);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [pathname, reloads]);

  return (
    <Link
      href="/account"
      aria-label={label}
      title={label}
      className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {viewer ? (
        <IdentityAvatar kind="profiles" avatarId={viewer.avatarId} name={viewer.name} />
      ) : (
        <span className="flex size-8 items-center justify-center rounded-full border bg-muted text-muted-foreground hover:text-foreground">
          <UserRound aria-hidden="true" className="size-4" />
        </span>
      )}
    </Link>
  );
}
