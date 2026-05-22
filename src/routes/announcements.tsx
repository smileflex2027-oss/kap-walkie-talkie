import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Megaphone, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/announcements")({
  component: AnnouncementsPage,
  head: () => ({ meta: [{ title: "Announcements — Kap" }] }),
});

type Post = {
  id: string;
  author_id: string;
  title: string;
  content: string;
  created_at: string;
};

type Author = { user_id: string; display_name: string; avatar_url: string | null };

function AnnouncementsPage() {
  const { user, isAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  const load = async () => {
    const { data } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Post[];
    setPosts(list);
    const ids = [...new Set(list.map((p) => p.author_id))];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,display_name,avatar_url")
        .in("user_id", ids);
      const map: Record<string, Author> = {};
      (profs ?? []).forEach((p: any) => (map[p.user_id] = p));
      setAuthors(map);
    }
  };

  useEffect(() => {
    if (!user) return;
    load();
    const channel = supabase
      .channel("posts-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || !content.trim()) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("posts").insert({
      author_id: user.id,
      title: title.trim(),
      content: content.trim(),
    });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setTitle("");
      setContent("");
      setShowForm(false);
    }
  };

  const remove = async (p: Post) => {
    if (!confirm(`Delete "${p.title}"?`)) return;
    await supabase.from("posts").delete().eq("id", p.id);
  };

  if (loading || !user) {
    return <main className="min-h-screen grid place-items-center text-muted-foreground">Loading…</main>;
  }

  return (
    <main className="min-h-screen px-5 py-6 pt-16 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="size-6 text-primary" /> Announcements
          </h1>
          <p className="text-sm text-muted-foreground">Public posts from admins</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground font-semibold"
          >
            <Plus className="size-4" /> New
          </button>
        )}
      </div>

      {isAdmin && showForm && (
        <form onSubmit={publish} className="rounded-lg border border-border bg-card p-4 space-y-3 mb-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="Title"
            className="input"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            maxLength={10000}
            rows={5}
            placeholder="Write your announcement…"
            className="input resize-y"
          />
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-2 text-sm rounded-md hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-50"
            >
              {busy ? "Publishing…" : "Publish"}
            </button>
          </div>
        </form>
      )}

      <ul className="space-y-3">
        {posts.map((p) => {
          const a = authors[p.author_id];
          return (
            <li key={p.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="size-8 rounded-full bg-secondary overflow-hidden grid place-items-center font-bold text-xs shrink-0">
                    {a?.avatar_url ? (
                      <img src={a.avatar_url} alt="" className="size-full object-cover" />
                    ) : (
                      (a?.display_name ?? "?").charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{a?.display_name ?? "Admin"}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(p.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => remove(p)}
                    className="size-8 rounded-md grid place-items-center hover:bg-secondary text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <h2 className="text-base font-bold mb-1">{p.title}</h2>
              <p className="text-sm whitespace-pre-wrap text-foreground/90">{p.content}</p>
            </li>
          );
        })}
        {posts.length === 0 && (
          <li className="text-center text-sm text-muted-foreground py-12">
            No announcements yet{isAdmin && " — be the first to post one"}.
          </li>
        )}
      </ul>
    </main>
  );
}
