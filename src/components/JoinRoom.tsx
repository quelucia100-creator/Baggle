import { useId, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { Field, PopButton } from "@/components/Field";
import { readPartyInvitation } from "@/lib/party-invitation";

export function JoinRoom({ username }: { username: string }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const errorId = useId();
  const navigate = useNavigate();
  const code = readPartyInvitation(input);

  const join = async () => {
    if (pending.current || !username || !code) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await navigate({ to: "/journey/join/$code", params: { code } });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't join this room. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`${errorId}-title`} className="mt-6 border-y-2 border-crust/15 py-6">
      <h2 id={`${errorId}-title`} className="mb-4 text-xl font-extrabold">Join a room</h2>
      <form onSubmit={(event) => { event.preventDefault(); void join(); }} aria-busy={busy}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field label="Party code or invite link" value={input} placeholder="ABC123" required
              autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy}
              aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
              onChange={(event) => { setInput(event.target.value); setError(""); }} />
          </div>
          <PopButton type="submit" tone="sage" disabled={busy || !code || !username}
            className="flex shrink-0 items-center justify-center gap-2 sm:!w-auto sm:px-6">
            <LogIn aria-hidden="true" className="h-5 w-5" />{busy ? "Joining…" : "Join party"}
          </PopButton>
        </div>
        {error && <p id={errorId} role="alert" className="mt-3 break-words text-sm font-semibold">{error}</p>}
      </form>
    </section>
  );
}