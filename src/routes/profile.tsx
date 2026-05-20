import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Profile — Kap" }] }),
});

function ProfilePage() {
  const { user, profile, isAdmin, loading, refreshProfile, signOut } = useAuth();
  const nav = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (profile) setDisplayName(profile.display_name);
  }, [profile]);

  const saveName = async () => {
    if (!user) return;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("user_id", user.id);
    setSaving(false);
    if (error) setMsg(error.message);
    else {
      await refreshProfile();
      setMsg("Saved");
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    setUploading(true);
    setMsg(null);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("user_id", user.id);
      if (dbErr) throw dbErr;
      await refreshProfile();
      setMsg("Photo updated");
    } catch (e: any) {
      setMsg(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (loading || !profile) {
    return <main className="min-h-screen grid place-items-center text-muted-foreground">Loading…</main>;
  }

  return (
    <main className="min-h-screen px-5 py-6 max-w-md mx-auto">
      <header className="flex items-center justify-between mb-6">
        <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <button onClick={() => { signOut(); nav({ to: "/auth" }); }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive">
          <LogOut className="size-4" /> Sign out
        </button>
      </header>

      <h1 className="text-2xl font-bold mb-6">Your profile</h1>

      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="relative">
          <div className="size-28 rounded-full bg-secondary overflow-hidden grid place-items-center text-3xl font-bold">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="size-full object-cover" />
            ) : (
              profile.display_name.charAt(0).toUpperCase()
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute bottom-0 right-0 size-9 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg disabled:opacity-60"
            aria-label="Change photo"
          >
            <Camera className="size-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadAvatar(f);
              e.target.value = "";
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{uploading ? "Uploading…" : "Tap the camera to change"}</p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Display name</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input mt-1" maxLength={40} />
        </label>

        <div className="text-xs text-muted-foreground">
          Email: <span className="text-foreground">{user?.email}</span>
        </div>

        <button onClick={saveName} disabled={saving} className="w-full rounded-lg bg-primary text-primary-foreground font-semibold py-3 disabled:opacity-60">
          {saving ? "Saving…" : "Save changes"}
        </button>

        {msg && <p className="text-sm text-center text-muted-foreground">{msg}</p>}

        {isAdmin && (
          <Link to="/admin" className="block text-center text-sm text-primary hover:underline mt-4">
            Open admin dashboard →
          </Link>
        )}
      </div>
    </main>
  );
}
