import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { RealtimeChannel } from "@supabase/supabase-js";

const Ctx = createContext<Set<string>>(new Set());

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [online, setOnline] = useState<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!user) {
      setOnline(new Set());
      return;
    }

    let cancelled = false;

    const connect = () => {
      const channel = supabase.channel("presence:lobby", {
        config: { presence: { key: user.id } },
      });
      channelRef.current = channel;
      channel
        .on("presence", { event: "sync" }, () => {
          if (cancelled) return;
          const state = channel.presenceState();
          setOnline(new Set(Object.keys(state)));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ online_at: new Date().toISOString() });
          }
        });
    };

    connect();

    // Heartbeat keeps presence fresh even when tab is throttled in background.
    const heartbeat = window.setInterval(() => {
      const ch = channelRef.current;
      if (ch) ch.track({ online_at: new Date().toISOString() }).catch(() => {});
    }, 20000);

    // If the tab is hidden and the socket got dropped, reconnect on wake.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        const ch = channelRef.current;
        if (ch) ch.track({ online_at: new Date().toISOString() }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Request a screen wake lock so the OS doesn't suspend the page as aggressively
    // (best-effort; not supported in every browser/webview).
    const requestWake = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> };
        };
        if (nav.wakeLock && !wakeRef.current) {
          wakeRef.current = await nav.wakeLock.request("screen");
          wakeRef.current.addEventListener("release", () => {
            wakeRef.current = null;
          });
        }
      } catch {
        /* ignore */
      }
    };
    requestWake();
    const onVis2 = () => {
      if (document.visibilityState === "visible") requestWake();
    };
    document.addEventListener("visibilitychange", onVis2);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("visibilitychange", onVis2);
      if (wakeRef.current) {
        wakeRef.current.release().catch(() => {});
        wakeRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user]);

  return <Ctx.Provider value={online}>{children}</Ctx.Provider>;
}

export const usePresence = () => useContext(Ctx);
