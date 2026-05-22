import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePresence } from "@/hooks/use-presence";

export const Route = createFileRoute("/messages/$userId")({
  component: ThreadPage,
  head: () => ({ meta: [{ title: "Message — Kap" }] }),
});

type Msg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
};

type Peer = { user_id: string; display_name: string; avatar_url: string | null };

function ThreadPage() {
  const { userId } = Route.useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const online = usePresence();
  const [peer, setPeer] = useState<Peer | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("user_id,display_name,avatar_url")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setPeer(data as Peer | null));
  }, [userId]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("direct_messages")
      .select("*")
      .or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`,
      )
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages((data ?? []) as Msg[]));

    const channel = supabase
      .channel(`dm:${[user.id, userId].sort().join(":")}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const m = payload.new as Msg;
          if (
            (m.sender_id === user.id && m.recipient_id === userId) ||
            (m.sender_id === userId && m.recipient_id === user.id)
          ) {
            setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, userId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !text.trim() || sending) return;
    setSending(true);
    setErr(null);
    const content = text.trim();
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: user.id,
      recipient_id: userId,
      content,
    });
    setSending(false);
    if (error) setErr(error.message);
    else setText("");
  };

  if (loading || !user) {
    return <main className="min-h-screen grid place-items-center text-muted-foreground">Loading…</main>;
  }

  const isOnline = online.has(userId);

  return (
    <main className="min-h-screen flex flex-col max-w-2xl mx-auto">
      <header className="flex items-center gap-3 px-4 py-3 pt-14 border-b border-border sticky top-0 bg-background z-10">
        <Link to="/users" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="relative">
          <div className="size-9 rounded-full bg-secondary overflow-hidden grid place-items-center font-bold">
            {peer?.avatar_url ? (
              <img src={peer.avatar_url} alt="" className="size-full object-cover" />
            ) : (
              (peer?.display_name ?? "?").charAt(0).toUpperCase()
            )}
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background ${
              isOnline ? "bg-green-500" : "bg-muted-foreground/40"
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{peer?.display_name ?? "User"}</div>
          <div className="text-xs text-muted-foreground">{isOnline ? "Online" : "Offline"}</div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No messages yet. Say hi 👋</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary text-foreground rounded-bl-sm"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                <div className={`text-[10px] mt-0.5 opacity-70 ${mine ? "text-right" : ""}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {err && <p className="text-xs text-destructive px-4 pb-2">{err}</p>}

      <form onSubmit={send} className="flex items-center gap-2 p-3 border-t border-border bg-background">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={4000}
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="size-10 rounded-full bg-primary text-primary-foreground grid place-items-center disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="size-4" />
        </button>
      </form>
    </main>
  );
}
