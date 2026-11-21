import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import logo from "@/assets/baggle-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/BagelScene";
import { Field, PopButton } from "@/components/Field";
import { GoogleButton } from "@/components/GoogleButton";
import { isStrongPassword } from "@/lib/password";
import { PasswordRules } from "@/components/PasswordRules";
import { PaperIcon } from "@/components/PaperIcon";
import { MailIcon } from "@/components/icons";
import { BackLink } from "@/components/BackLink";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Log in or sign up — Baggle" },
      { name: "description", content: "Log in or create your Baggle account with Google or email." },
      { property: "og:title", content: "Log in to Baggle" },
      { property: "og:description", content: "Log in or create your Baggle account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [tab, setTab] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: "/home" }); });
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "SIGNED_IN") navigate({ to: "/home" }); });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (tab === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/auth", data: { display_name: username.trim() } },
        });
        if (error) throw error;
        setSent("Check your inbox to confirm your email, then log in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
        if (error) throw error;
        setSent("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally { setBusy(false); }
  };

  const canSubmit = tab === "signup" ? username.trim().length >= 2 && isStrongPassword(password) && email : email && (tab === "forgot" || password);

  return (
    <AuthShell>
      <BackLink />
      <Link to="/"><img src={logo.url} alt="Baggle home" className="mx-auto mb-4 w-56 max-w-full" /></Link>
      {sent ? (
        <div className="paper rounded-3xl border-2 border-crust bg-sage p-6 shadow-pop">
          <div className="flex items-center gap-3">
            <PaperIcon tone="cream" back="chartreuse" className="h-12 w-12"><MailIcon className="h-6 w-6" /></PaperIcon>
            <h1 className="text-2xl font-extrabold">Nearly there</h1>
          </div>
          <p className="mt-3">{sent}</p>
          <button className="mt-4 text-sm font-semibold underline" onClick={() => { setSent(null); setTab("login"); }}>Back to log in</button>
        </div>
      ) : (
        <>
          {tab !== "forgot" && (
            <div className="mb-6 grid grid-cols-2 rounded-full border-2 border-crust bg-cream p-1">
              {(["login", "signup"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`rounded-full py-2 font-display font-extrabold ${tab === t ? "bg-tangerine shadow-pop" : ""}`}>
                  {t === "login" ? "Log in" : "Sign up"}
                </button>
              ))}
            </div>
          )}
          <h1 className="text-2xl font-extrabold">{tab === "login" ? "Welcome back!" : tab === "signup" ? "Join the crew" : "Reset your password"}</h1>
          {tab !== "forgot" && (
            <div className="mt-5 space-y-3">
              <GoogleButton label={tab === "signup" ? "Sign up with Google" : "Continue with Google"} />
              <div className="flex items-center gap-3 text-xs font-bold uppercase text-muted-foreground"><span className="h-0.5 flex-1 bg-crust/20" />or with email<span className="h-0.5 flex-1 bg-crust/20" /></div>
            </div>
          )}
          <form onSubmit={submit} className="mt-4 space-y-4">
            {tab === "signup" && <Field label="Username (display name)" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} required />}
            <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            {tab !== "forgot" && <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={tab === "signup" ? "new-password" : "current-password"} required />}
            {tab === "signup" && <PasswordRules password={password} />}
            <PopButton type="submit" disabled={busy || !canSubmit}>
              {busy ? "One sec…" : tab === "login" ? "Log in" : tab === "signup" ? "Create account" : "Send reset link"}
            </PopButton>
          </form>
          <button onClick={() => setTab(tab === "forgot" ? "login" : "forgot")} className="mt-4 w-full text-sm font-semibold underline underline-offset-4">
            {tab === "forgot" ? "← Back to log in" : "Forgot password?"}
          </button>
        </>
      )}
    </AuthShell>
  );
}
