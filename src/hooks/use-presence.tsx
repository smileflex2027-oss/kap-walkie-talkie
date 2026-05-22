import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const Ctx = createContext<Set<string>>(new Set());

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setOnline(new Set());
      return;
    }
    const channel = supabase.channel("presence:lobby", {
      config: { presence: { key: user.id } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnline(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return <Ctx.Provider value={online}>{children}</Ctx.Provider>;
}

export const usePresence = () => useContext(Ctx);
