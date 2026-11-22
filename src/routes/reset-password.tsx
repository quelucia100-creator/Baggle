import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/BagelScene";
import { Field, PopButton } from "@/components/Field";
import { isStrongPassword } from "@/lib/password";
import { PasswordRules } from "@/components/PasswordRules";
import { BackLink } from "@/components/BackLink";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Baggle" },
      { name: "description", content: "Choose a new password for your Baggle account." },
      { property: "og:title", content: "Reset password — Baggle" },
      { property: "og:description", content: "Choose a new password for your Baggle account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  return (
    <AuthShell>
      <BackLink to="/auth" />
      <h1 className="text-2xl font-extrabold">Set a new password</h1>
      <form className="mt-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.updateUser({ password });
        if (error) { toast.error(error.message); return; }
        toast.success("Password updated!");
        navigate({ to: "/home", replace: true });
      }}>
        <Field label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <PasswordRules password={password} />
        <PopButton type="submit" disabled={!isStrongPassword(password)}>Save password</PopButton>
      </form>
    </AuthShell>
  );
}
