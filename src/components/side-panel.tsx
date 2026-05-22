import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X, Home, User, Shield, LogOut, LogIn, Radio, Users, Megaphone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePresence } from "@/hooks/use-presence";

export function SidePanel() {
  const [open, setOpen] = useState(false);
  const { user, profile, isAdmin, signOut } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock scroll when open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const online = usePresence();
  const links = [
    { to: "/", label: "Channels", icon: Home, show: true },
    { to: "/users", label: `Users${online.size ? ` (${online.size} online)` : ""}`, icon: Users, show: !!user },
    { to: "/announcements", label: "Announcements", icon: Megaphone, show: !!user },
    { to: "/profile", label: "Profile", icon: User, show: !!user },
    { to: "/admin", label: "Admin", icon: Shield, show: isAdmin },
  ].filter((l) => l.show);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="fixed top-3 left-3 z-40 size-10 rounded-lg bg-card/80 backdrop-blur border border-border grid place-items-center text-foreground hover:bg-card shadow-sm"
      >
        <Menu className="size-5" />
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Panel */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 max-w-[85vw] bg-card border-r border-border shadow-xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2 font-bold">
            <Radio className="size-5 text-primary" />
            Kap Walkie-Talkie
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="size-8 rounded-md grid place-items-center hover:bg-secondary text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {user && (
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <div className="size-10 rounded-full bg-secondary overflow-hidden grid place-items-center font-bold shrink-0">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="size-full object-cover" />
              ) : (
                (profile?.display_name ?? user.email ?? "?").charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{profile?.display_name ?? "User"}</div>
              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
            </div>
          </div>
        )}

        <nav className="p-2">
          {links.map((l) => {
            const active = pathname === l.to;
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                <l.icon className="size-4" />
                {l.label}
              </Link>
            );
          })}

          <div className="my-2 border-t border-border" />

          {user ? (
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-destructive hover:bg-secondary"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          ) : (
            <Link
              to="/auth"
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-foreground hover:bg-secondary"
            >
              <LogIn className="size-4" />
              Sign in
            </Link>
          )}
        </nav>
      </aside>
    </>
  );
}
