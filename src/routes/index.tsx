import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Radio, Users, Wifi, WifiOff, Mic, LogOut, UserCog, Shield } from "lucide-react";
import { walkie, type WalkieState } from "@/lib/walkie";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  component: KapWalkie,
  head: () => ({
    meta: [
      { title: "Kap Walkie-Talkie — Talk over Wi-Fi" },
      {
        name: "description",
        content: "Kap is a browser walkie-talkie. Join a channel on the same Wi-Fi and push to talk.",
      },
    ],
  }),
});

type ChannelRow = { id: string; name: string; description: string | null; password: string | null };

function KapWalkie() {
  const { user, profile, isAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [state, setState] = useState<WalkieState>(() => ({
    connected: false, channel: "", myId: "", myName: "", peers: new Map(), transmitting: false,
  }));
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [pwd, setPwd] = useState("");
  const [joining, setJoining] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pttRef = useRef<HTMLButtonElement>(null);

  useEffect(() => walkie.subscribe(setState), []);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("channels").select("*").order("name").then(({ data }) => {
      setChannels((data ?? []) as ChannelRow[]);
      if (data && data.length && !selected) setSelected(data[0].id);
    });
  }, [user]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const ch = channels.find((c) => c.id === selected);
    if (!ch || !profile) return;
    if (profile.is_banned) { setErr("Your account is banned."); return; }
    if (ch.password && ch.password !== pwd) { setErr("Wrong channel password."); return; }
    setJoining(true);
    try {
      await walkie.join(ch.name, profile.display_name);
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (!state.connected) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) { e.preventDefault(); walkie.startTalking(); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); walkie.stopTalking(); }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [state.connected]);

  if (loading || !user || !profile) {
    return <main className="min-h-screen grid place-items-center text-muted-foreground">Loading…</main>;
  }

  if (!state.connected) {
    const ch = channels.find((c) => c.id === selected);
    return (
      <main className="min-h-screen flex flex-col items-center px-6 py-8">
        <header className="w-full max-w-sm flex items-center justify-between mb-8">
          <Link to="/profile" className="flex items-center gap-2">
            <div className="size-9 rounded-full bg-secondary overflow-hidden grid place-items-center font-bold text-sm">
              {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="size-full object-cover" /> : profile.display_name.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-semibold">{profile.display_name}</span>
          </Link>
          <div className="flex gap-1">
            {isAdmin && (
              <Link to="/admin" className="size-9 rounded-md grid place-items-center text-primary hover:bg-secondary" title="Admin">
                <Shield className="size-4" />
              </Link>
            )}
            <Link to="/profile" className="size-9 rounded-md grid place-items-center text-muted-foreground hover:bg-secondary" title="Profile">
              <UserCog className="size-4" />
            </Link>
          </div>
        </header>

        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="size-14 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-lg">
            <Radio className="size-7" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Kap Walkie-Talkie</h1>
        </div>

        <form onSubmit={handleJoin} className="w-full max-w-sm space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Channel</label>
            {channels.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No channels available. Ask an admin to create one.</p>
            ) : (
              <select value={selected} onChange={(e) => setSelected(e.target.value)} className="input mt-1">
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.password ? " 🔒" : ""}</option>
                ))}
              </select>
            )}
            {ch?.description && <p className="mt-1 text-xs text-muted-foreground">{ch.description}</p>}
          </div>

          {ch?.password && (
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Channel password</label>
              <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="input mt-1" />
            </div>
          )}

          <button type="submit" disabled={joining || channels.length === 0} className="w-full rounded-lg bg-primary text-primary-foreground font-semibold py-3 disabled:opacity-60">
            {joining ? "Joining…" : "Join channel"}
          </button>

          {(err || state.lastError) && <p className="text-sm text-destructive text-center">{err || state.lastError}</p>}
        </form>

        <footer className="mt-10 text-xs text-muted-foreground text-center max-w-xs">
          Works best when everyone is on the same Wi-Fi. Allow microphone when prompted.
        </footer>
      </main>
    );
  }

  const peers = Array.from(state.peers.values());
  const anySpeaking = state.transmitting || peers.some((p) => p.speaking);

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Wifi className="size-4 text-success" />
          <span className="text-sm font-semibold">{state.channel}</span>
        </div>
        <button onClick={() => walkie.leave()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <LogOut className="size-4" /> Leave
        </button>
      </header>

      <section className="px-5 py-4 flex-1 overflow-auto">
        <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          <Users className="size-3.5" /> On the channel ({peers.length + 1})
        </div>

        <ul className="space-y-2">
          <PeerRow name={`${state.myName} (you)`} avatar={profile.avatar_url} speaking={state.transmitting} me />
          {peers.map((p, i) => (
            <PeerRow key={i} name={p.name} speaking={p.speaking} />
          ))}
          {peers.length === 0 && (
            <li className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              <WifiOff className="size-5 mx-auto mb-2 opacity-60" />
              Waiting for others to join <span className="font-mono">{state.channel}</span>…
            </li>
          )}
        </ul>
      </section>

      <section className="px-6 pb-10 pt-4 flex flex-col items-center gap-4">
        <div className="h-6 flex items-end gap-1">
          {anySpeaking ? (
            Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className="bar w-1.5 h-full bg-primary rounded-full" style={{ animationDelay: `${i * 0.08}s` }} />
            ))
          ) : (
            <span className="text-xs text-muted-foreground">Hold to talk · or press Space</span>
          )}
        </div>

        <button
          ref={pttRef}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); walkie.startTalking(); }}
          onPointerUp={() => walkie.stopTalking()}
          onPointerCancel={() => walkie.stopTalking()}
          onPointerLeave={(e) => {
            if (state.transmitting) walkie.stopTalking();
            e.currentTarget.releasePointerCapture?.(e.pointerId);
          }}
          className={`size-44 rounded-full bg-primary text-primary-foreground grid place-items-center select-none transition-transform active:scale-95 ${
            state.transmitting ? "ptt-active scale-105" : "shadow-2xl"
          }`}
          aria-label="Push to talk"
        >
          <Mic className="size-16" strokeWidth={2.5} />
        </button>

        <p className="text-sm font-semibold tracking-wide">
          {state.transmitting ? "TRANSMITTING" : "PUSH TO TALK"}
        </p>
      </section>
    </main>
  );
}

function PeerRow({ name, avatar, speaking, me = false }: { name: string; avatar?: string | null; speaking: boolean; me?: boolean }) {
  return (
    <li className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${speaking ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
      <div className="flex items-center gap-3">
        <div className={`size-9 rounded-full grid place-items-center font-bold overflow-hidden ${speaking ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
          {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : (name.trim().charAt(0).toUpperCase() || "?")}
        </div>
        <div>
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-xs text-muted-foreground">{speaking ? "Speaking…" : me ? "You" : "Listening"}</div>
        </div>
      </div>
      {speaking && (
        <div className="flex items-end gap-0.5 h-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="bar w-1 h-full bg-primary rounded-full" style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      )}
    </li>
  );
}
