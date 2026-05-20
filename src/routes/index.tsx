import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Radio, Users, Wifi, WifiOff, Mic, LogOut } from "lucide-react";
import { walkie, type WalkieState } from "@/lib/walkie";

export const Route = createFileRoute("/")({
  component: KapWalkie,
  head: () => ({
    meta: [
      { title: "Kap Walkie-Talkie — Talk over Wi-Fi" },
      {
        name: "description",
        content:
          "Kap is a browser walkie-talkie. Join a channel on the same Wi-Fi and push to talk — no SIM, no setup.",
      },
    ],
  }),
});

function KapWalkie() {
  const [state, setState] = useState<WalkieState>(() => ({
    connected: false,
    channel: "",
    myId: "",
    myName: "",
    peers: new Map(),
    transmitting: false,
  }));
  const [channel, setChannel] = useState("kap-1");
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const pttRef = useRef<HTMLButtonElement>(null);

  useEffect(() => walkie.subscribe(setState), []);

  useEffect(() => {
    const saved = localStorage.getItem("kap-name");
    if (saved) setName(saved);
  }, []);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !channel.trim()) return;
    localStorage.setItem("kap-name", name);
    setJoining(true);
    try {
      await walkie.join(channel.trim(), name.trim());
    } catch {
      /* error surfaced via state */
    } finally {
      setJoining(false);
    }
  };

  // Push-to-talk via pointer events (works for touch + mouse)
  const start = () => walkie.startTalking();
  const stop = () => walkie.stopTalking();

  // Spacebar PTT on desktop
  useEffect(() => {
    if (!state.connected) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        walkie.startTalking();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        walkie.stopTalking();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [state.connected]);

  if (!state.connected) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
        <header className="flex flex-col items-center gap-3 mb-10">
          <div className="size-16 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-lg">
            <Radio className="size-8" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Kap Walkie-Talkie</h1>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Push to talk to anyone on the same channel — over Wi-Fi, in your browser.
          </p>
        </header>

        <form onSubmit={handleJoin} className="w-full max-w-sm space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Your name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex"
              className="mt-1 w-full rounded-lg bg-card border border-border px-4 py-3 text-base outline-none focus:border-primary"
              maxLength={24}
              required
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Channel
            </label>
            <input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="kap-1"
              className="mt-1 w-full rounded-lg bg-card border border-border px-4 py-3 text-base outline-none focus:border-primary"
              maxLength={32}
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Share this name with people you want to talk to.
            </p>
          </div>

          <button
            type="submit"
            disabled={joining}
            className="w-full rounded-lg bg-primary text-primary-foreground font-semibold py-3 text-base hover:opacity-95 active:opacity-90 disabled:opacity-60"
          >
            {joining ? "Joining…" : "Join channel"}
          </button>

          {state.lastError && (
            <p className="text-sm text-destructive text-center">{state.lastError}</p>
          )}
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
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Wifi className="size-4 text-success" />
          <span className="text-sm font-semibold">{state.channel}</span>
        </div>
        <button
          onClick={() => walkie.leave()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-4" /> Leave
        </button>
      </header>

      {/* Peers */}
      <section className="px-5 py-4 flex-1 overflow-auto">
        <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          <Users className="size-3.5" />
          On the channel ({peers.length + 1})
        </div>

        <ul className="space-y-2">
          <PeerRow name={`${state.myName} (you)`} speaking={state.transmitting} me />
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

      {/* PTT */}
      <section className="px-6 pb-10 pt-4 flex flex-col items-center gap-4">
        <div className="h-6 flex items-end gap-1">
          {anySpeaking ? (
            Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className="bar w-1.5 h-full bg-primary rounded-full"
                style={{ animationDelay: `${i * 0.08}s` }}
              />
            ))
          ) : (
            <span className="text-xs text-muted-foreground">Hold to talk · or press Space</span>
          )}
        </div>

        <button
          ref={pttRef}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            start();
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onPointerLeave={(e) => {
            if (state.transmitting) stop();
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

function PeerRow({
  name,
  speaking,
  me = false,
}: {
  name: string;
  speaking: boolean;
  me?: boolean;
}) {
  return (
    <li
      className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
        speaking ? "border-primary bg-primary/10" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`size-9 rounded-full grid place-items-center font-bold ${
            speaking ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
          }`}
        >
          {name.trim().charAt(0).toUpperCase() || "?"}
        </div>
        <div>
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-xs text-muted-foreground">
            {speaking ? "Speaking…" : me ? "You" : "Listening"}
          </div>
        </div>
      </div>
      {speaking && (
        <div className="flex items-end gap-0.5 h-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className="bar w-1 h-full bg-primary rounded-full"
              style={{ animationDelay: `${i * 0.08}s` }}
            />
          ))}
        </div>
      )}
    </li>
  );
}
