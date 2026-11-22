import { useId, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogIn } from "lucide-react";
import { Field, PopButton } from "@/components/Field";
import { accessParty } from "@/lib/party";
import { normalizePartyCode } from "@/lib/password";

export function JoinRoom({ username }: { username: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const errorId = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const join = async () => {
    if (pending.current || !username || !/^[A-Z0-9]{6}$/.test(code)) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const party = await accessParty("join", code, username);
      await queryClient.cancelQueries({ queryKey: ["party", party.code] });
      queryClient.setQueryData(["party", party.code], party);
      await navigate({ to: "/party/$code", params: { code: party.code }, replace: true });
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
            <Field label="Room code" value={code} placeholder="ABC123" required
              autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy}
              aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
              onChange={(event) => { setCode(normalizePartyCode(event.target.value)); setError(""); }} />
          </div>
          <PopButton type="submit" tone="sage" disabled={busy || code.length !== 6 || !username}
            className="flex shrink-0 items-center justify-center gap-2 sm:!w-auto sm:px-6">
            <LogIn aria-hidden="true" className="h-5 w-5" />{busy ? "Joining…" : "Join room"}
          </PopButton>
        </div>
        {error && <p id={errorId} role="alert" className="mt-3 break-words text-sm font-semibold">{error}</p>}
      </form>
    </section>
  );
}