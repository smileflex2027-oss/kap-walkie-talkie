import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2, Shield, ShieldOff, Ban, CheckCircle2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin — Kap" }] }),
});

type Row = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_banned: boolean;
  is_admin: boolean;
};

type Channel = {
  id: string;
  name: string;
  description: string | null;
  password: string | null;
};

function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<"users" | "channels">("users");
  const [users, setUsers] = useState<Row[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // New channel form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPwd, setNewPwd] = useState("");

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) nav({ to: "/" });
  }, [loading, user, isAdmin, nav]);

  const load = async () => {
    setBusy(true);
    const [{ data: profs }, { data: roles }, { data: chs }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("channels").select("*").order("name"),
    ]);
    const adminSet = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
    setUsers((profs ?? []).map((p: any) => ({ ...p, is_admin: adminSet.has(p.user_id) })));
    setChannels((chs ?? []) as Channel[]);
    setBusy(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const toggleBan = async (u: Row) => {
    await supabase.from("profiles").update({ is_banned: !u.is_banned }).eq("user_id", u.user_id);
    load();
  };

  const toggleAdmin = async (u: Row) => {
    if (u.is_admin) {
      await supabase.from("user_roles").delete().eq("user_id", u.user_id).eq("role", "admin");
    } else {
      await supabase.from("user_roles").insert({ user_id: u.user_id, role: "admin" });
    }
    load();
  };

  const deleteUser = async (u: Row) => {
    if (!confirm(`Delete profile for ${u.display_name}? (auth account remains)`)) return;
    await supabase.from("profiles").delete().eq("user_id", u.user_id);
    load();
  };

  const addChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.from("channels").insert({
      name: newName.trim(),
      description: newDesc.trim() || null,
      password: newPwd.trim() || null,
      created_by: user!.id,
    });
    if (error) setMsg(error.message);
    else {
      setNewName(""); setNewDesc(""); setNewPwd("");
      load();
    }
  };

  const deleteChannel = async (c: Channel) => {
    if (!confirm(`Delete channel ${c.name}?`)) return;
    await supabase.from("channels").delete().eq("id", c.id);
    load();
  };

  if (loading || !isAdmin) {
    return <main className="min-h-screen grid place-items-center text-muted-foreground">Loading…</main>;
  }

  return (
    <main className="min-h-screen px-5 py-6 max-w-2xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold">ADMIN</span>
      </header>

      <h1 className="text-2xl font-bold mb-4">CMS Dashboard</h1>

      <div className="flex gap-2 mb-6 border-b border-border">
        {(["users", "channels"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 -mb-px ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {msg && <p className="text-sm text-destructive mb-3">{msg}</p>}

      {tab === "users" && (
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.user_id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <div className="size-10 rounded-full bg-secondary overflow-hidden grid place-items-center font-bold">
                {u.avatar_url ? <img src={u.avatar_url} alt="" className="size-full object-cover" /> : u.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">
                  {u.display_name}
                  {u.is_admin && <span className="ml-2 text-xs text-primary">admin</span>}
                  {u.is_banned && <span className="ml-2 text-xs text-destructive">banned</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">{u.user_id.slice(0, 8)}…</div>
              </div>
              <div className="flex items-center gap-1">
                <IconBtn title={u.is_admin ? "Remove admin" : "Make admin"} onClick={() => toggleAdmin(u)}>
                  {u.is_admin ? <ShieldOff className="size-4" /> : <Shield className="size-4" />}
                </IconBtn>
                <IconBtn title={u.is_banned ? "Unban" : "Ban"} onClick={() => toggleBan(u)}>
                  {u.is_banned ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />}
                </IconBtn>
                <IconBtn title="Delete profile" onClick={() => deleteUser(u)} danger>
                  <Trash2 className="size-4" />
                </IconBtn>
              </div>
            </li>
          ))}
          {users.length === 0 && <li className="text-center text-sm text-muted-foreground py-8">{busy ? "Loading…" : "No users"}</li>}
        </ul>
      )}

      {tab === "channels" && (
        <>
          <form onSubmit={addChannel} className="rounded-lg border border-border bg-card p-4 space-y-3 mb-4">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Plus className="size-4" /> New channel</h3>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="Channel name" className="input" maxLength={32} />
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" className="input" maxLength={200} />
            <input value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Password (optional)" className="input" maxLength={64} />
            <button className="w-full rounded-lg bg-primary text-primary-foreground font-semibold py-2 text-sm">Create channel</button>
          </form>

          <ul className="space-y-2">
            {channels.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{c.name} {c.password && <span className="text-xs text-muted-foreground">🔒</span>}</div>
                  {c.description && <div className="text-xs text-muted-foreground truncate">{c.description}</div>}
                </div>
                <IconBtn title="Delete" onClick={() => deleteChannel(c)} danger>
                  <Trash2 className="size-4" />
                </IconBtn>
              </li>
            ))}
            {channels.length === 0 && <li className="text-center text-sm text-muted-foreground py-8">No channels</li>}
          </ul>
        </>
      )}
    </main>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`size-8 rounded-md grid place-items-center hover:bg-secondary ${danger ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
