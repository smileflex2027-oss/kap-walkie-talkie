import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Sign in — Kap Walkie-Talkie" }] }),
});

function AuthPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) nav({ to: "/" });
  }, [user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      nav({ to: "/" });
    } catch (e: any) {
      setErr(e.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <header className="flex flex-col items-center gap-3 mb-8">
        <div className="size-14 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-lg">
          <Radio className="size-7" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-bold">{mode === "login" ? "Welcome back" : "Create account"}</h1>
        <p className="text-sm text-muted-foreground">Kap Walkie-Talkie</p>
      </header>

      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        {mode === "signup" && (
          <Field label="Display name">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" maxLength={40} />
          </Field>
        )}
        <Field label="Email">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </Field>
        <Field label="Password">
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
        </Field>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <button disabled={busy} className="w-full rounded-lg bg-primary text-primary-foreground font-semibold py-3 disabled:opacity-60">
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Sign up"}
        </button>

        <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")} className="w-full text-sm text-muted-foreground hover:text-foreground">
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>

        <Link to="/" className="block text-center text-xs text-muted-foreground hover:text-foreground">← Back</Link>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
