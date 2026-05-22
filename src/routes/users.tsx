import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePresence } from "@/hooks/use-presence";
import { MessageSquare, Search } from "lucide-react";

export const Route = createFileRoute("/users")({
  component: UsersPage,
  head: () => ({ meta: [{ title: "Users — Kap" }] }),
});

type U = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
};

function UsersPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const online = usePresence();
  const [users, setUsers] = useState<U[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("user_id,display_name,avatar_url")
      .order("display_name")
      .then(({ data }) => setUsers((data ?? []) as U[]));
  }, []);

  const filtered = users
    .filter((u) => u.user_id !== user?.id)
    .filter((u) => !q || u.display_name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(online.has(b.user_id)) - Number(online.has(a.user_id)));

  return (
    <main className="min-h-screen px-5 py-6 pt-16 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Users</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {online.size} online · {users.length} total
      </p>

      <div className="relative mb-3">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search users…"
          className="input pl-9"
        />
      </div>

      <ul className="space-y-2">
        {filtered.map((u) => {
          const isOnline = online.has(u.user_id);
          return (
            <li
              key={u.user_id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="relative shrink-0">
                <div className="size-10 rounded-full bg-secondary overflow-hidden grid place-items-center font-bold">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="size-full object-cover" />
                  ) : (
                    u.display_name.charAt(0).toUpperCase()
                  )}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card ${
                    isOnline ? "bg-green-500" : "bg-muted-foreground/40"
                  }`}
                  title={isOnline ? "Online" : "Offline"}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{u.display_name}</div>
                <div className="text-xs text-muted-foreground">
                  {isOnline ? "Online" : "Offline"}
                </div>
              </div>
              <Link
                to="/messages/$userId"
                params={{ userId: u.user_id }}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-semibold"
              >
                <MessageSquare className="size-3.5" />
                Message
              </Link>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="text-center text-sm text-muted-foreground py-8">No users found</li>
        )}
      </ul>
    </main>
  );
}
