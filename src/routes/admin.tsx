import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Trash2, Shield, ShieldOff, Ban, CheckCircle2, Plus, Search, Eye, MicOff, Mic, X } from "lucide-react";
import { toast } from "sonner";
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
  is_muted: boolean;
  is_admin: boolean;
  created_at: string;
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
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<Row | null>(null);
  const [confirming, setConfirming] = useState<{ user: Row; action: "ban" | "mute" } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<{ action: "ban" | "mute" | "unban" | "unmute"; ids: string[] } | null>(null);

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

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.display_name.toLowerCase().includes(q) || u.user_id.toLowerCase().includes(q),
    );
  }, [users, query]);

  const applyFlag = async (u: Row, field: "is_banned" | "is_muted", value: boolean) => {
    const prev = u[field];
    setUsers((list) => list.map((x) => (x.user_id === u.user_id ? { ...x, [field]: value } : x)));
    const patch = (field === "is_banned" ? { is_banned: value } : { is_muted: value });
    const { error } = await supabase.from("profiles").update(patch).eq("user_id", u.user_id);
    if (error) {
      setUsers((list) => list.map((x) => (x.user_id === u.user_id ? { ...x, [field]: prev } : x)));
      toast.error(error.message);
      return;
    }
    const label = field === "is_banned" ? (value ? "banned" : "unbanned") : value ? "muted" : "unmuted";
    toast.success(`${u.display_name} ${label}`, {
      action: {
        label: "Undo",
        onClick: () => applyFlag({ ...u, [field]: value }, field, prev),
      },
    });
  };

  const requestFlag = (u: Row, action: "ban" | "mute") => {
    const field = action === "ban" ? "is_banned" : "is_muted";
    // Reversing is fine without confirm; only confirm when applying restriction.
    if (u[field]) {
      applyFlag(u, field, false);
    } else {
      setConfirming({ user: u, action });
    }
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
        <>
          <div className="relative mb-3">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or user ID…"
              className="input pl-9"
            />
          </div>
          <ul className="space-y-2">
            {filteredUsers.map((u) => (
              <li key={u.user_id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <button
                  onClick={() => setViewing(u)}
                  className="size-10 rounded-full bg-secondary overflow-hidden grid place-items-center font-bold shrink-0"
                  title="View profile"
                >
                  {u.avatar_url ? <img src={u.avatar_url} alt="" className="size-full object-cover" /> : u.display_name.charAt(0).toUpperCase()}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {u.display_name}
                    {u.is_admin && <span className="ml-2 text-xs text-primary">admin</span>}
                    {u.is_banned && <span className="ml-2 text-xs text-destructive">banned</span>}
                    {u.is_muted && <span className="ml-2 text-xs text-muted-foreground">muted</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{u.user_id.slice(0, 8)}…</div>
                </div>
                <div className="flex items-center gap-1">
                  <IconBtn title="View profile" onClick={() => setViewing(u)}>
                    <Eye className="size-4" />
                  </IconBtn>
                  <IconBtn title={u.is_admin ? "Remove admin" : "Make admin"} onClick={() => toggleAdmin(u)}>
                    {u.is_admin ? <ShieldOff className="size-4" /> : <Shield className="size-4" />}
                  </IconBtn>
                  <IconBtn title={u.is_muted ? "Unmute" : "Mute"} onClick={() => requestFlag(u, "mute")}>
                    {u.is_muted ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                  </IconBtn>
                  <IconBtn title={u.is_banned ? "Unban" : "Ban"} onClick={() => requestFlag(u, "ban")}>
                    {u.is_banned ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />}
                  </IconBtn>
                  <IconBtn title="Delete profile" onClick={() => deleteUser(u)} danger>
                    <Trash2 className="size-4" />
                  </IconBtn>
                </div>
              </li>
            ))}
            {filteredUsers.length === 0 && (
              <li className="text-center text-sm text-muted-foreground py-8">
                {busy ? "Loading…" : query ? "No matches" : "No users"}
              </li>
            )}
          </ul>
        </>
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

      {viewing && <ProfileModal user={viewing} onClose={() => setViewing(null)} />}
      {confirming && (
        <ConfirmModal
          title={confirming.action === "ban" ? "Ban user?" : "Mute user?"}
          body={
            confirming.action === "ban"
              ? `${confirming.user.display_name} will lose access to channels until unbanned.`
              : `${confirming.user.display_name} will not be able to transmit audio until unmuted.`
          }
          confirmLabel={confirming.action === "ban" ? "Ban" : "Mute"}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const { user: u, action } = confirming;
            setConfirming(null);
            applyFlag(u, action === "ban" ? "is_banned" : "is_muted", true);
          }}
        />
      )}
    </main>
  );
}

function ProfileModal({ user, onClose }: { user: Row; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 size-8 rounded-md grid place-items-center hover:bg-secondary text-muted-foreground">
          <X className="size-4" />
        </button>
        <div className="flex flex-col items-center text-center">
          <div className="size-24 rounded-full bg-secondary overflow-hidden grid place-items-center text-3xl font-bold mb-3">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.display_name} className="size-full object-cover" />
            ) : (
              user.display_name.charAt(0).toUpperCase()
            )}
          </div>
          <h2 className="text-lg font-bold">{user.display_name}</h2>
          <div className="flex flex-wrap gap-1.5 justify-center mt-2">
            {user.is_admin && <Tag tone="primary">admin</Tag>}
            {user.is_banned && <Tag tone="destructive">banned</Tag>}
            {user.is_muted && <Tag tone="muted">muted</Tag>}
            {!user.is_admin && !user.is_banned && !user.is_muted && <Tag tone="muted">active user</Tag>}
          </div>
        </div>
        <dl className="mt-5 space-y-2 text-sm">
          <Field label="User ID" value={user.user_id} mono />
          <Field label="Joined" value={new Date(user.created_at).toLocaleString()} />
        </dl>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground mb-5">{body}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-md hover:bg-secondary">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground font-semibold">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "primary" | "destructive" | "muted" }) {
  const cls =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "destructive"
      ? "bg-destructive/10 text-destructive"
      : "bg-secondary text-muted-foreground";
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls}`}>{children}</span>;
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className={`text-right truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
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
