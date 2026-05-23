import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type DM = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
};

// Simple beep using WebAudio so we don't need an audio asset
function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.start();
    o.stop(ctx.currentTime + 0.5);
    setTimeout(() => ctx.close(), 700);
  } catch {
    /* ignore */
  }
}

async function notify(title: string, body: string, tag?: string) {
  if (typeof window === "undefined") return;
  beep();
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) {
      reg.showNotification(title, { body, tag, icon: "/favicon.ico", badge: "/favicon.ico" });
    } else {
      new Notification(title, { body, tag, icon: "/favicon.ico" });
    }
  } catch {
    /* ignore */
  }
}

export function useNotifications() {
  const { user } = useAuth();
  const senders = useRef<Map<string, string>>(new Map());

  // Ask permission once, after auth
  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      // gentle delay so it doesn't fire mid-render
      const t = setTimeout(() => Notification.requestPermission().catch(() => {}), 1500);
      return () => clearTimeout(t);
    }
  }, [user]);

  // Subscribe to incoming DMs globally
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`dm-inbox:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `recipient_id=eq.${user.id}`,
        },
        async (payload) => {
          const m = payload.new as DM;
          let name = senders.current.get(m.sender_id);
          if (!name) {
            const { data } = await supabase
              .from("profiles")
              .select("display_name")
              .eq("user_id", m.sender_id)
              .maybeSingle();
            name = data?.display_name ?? "New message";
            senders.current.set(m.sender_id, name);
          }
          // Skip if user is actively viewing this thread in the foreground
          const inThread =
            document.visibilityState === "visible" &&
            window.location.pathname === `/messages/${m.sender_id}`;
          if (inThread) return;
          notify(name, m.content.slice(0, 140), `dm:${m.sender_id}`);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);
}
