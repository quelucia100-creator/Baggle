import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CalendarDays } from "lucide-react";
import { PopButton } from "@/components/Field";
import { groupOpeningsQuery, openingTime, pokeGroup } from "@/lib/group-openings";
import { weekdayLabel } from "@/lib/account-availability-model";

export function GroupOpenings({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const openings = useQuery(groupOpeningsQuery(groupId));
  const [message, setMessage] = useState<string | null>(null);
  const poke = useMutation({
    mutationFn: (weekday: number) => pokeGroup(groupId, weekday),
    onMutate: () => setMessage(null),
    onSuccess: () => {
      setMessage("Poke sent — your group has a hangout notification.");
      qc.invalidateQueries({ queryKey: ["group-openings", groupId] });
    },
    onError: (error) => {
      setMessage(error.message);
      qc.invalidateQueries({ queryKey: ["group-openings", groupId] });
    },
  });
  const weekdays = [...new Set(openings.data?.openings.map((w) => w.weekday) ?? [])];

  return (
    <div className="mt-5 border-t-2 border-crust/15 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 font-extrabold"><CalendarDays aria-hidden="true" className="h-5 w-5" /> Free together</h4>
        <span className="text-xs font-semibold text-muted-foreground">Weekly · Montréal time</span>
      </div>
      {openings.isPending && <p role="status" className="mt-3 text-sm">Finding shared openings…</p>}
      {openings.isError && <div role="alert" className="mt-3"><p className="text-sm">Couldn't load shared openings.</p><PopButton tone="vista" className="mt-2 !w-auto px-4" onClick={() => openings.refetch()}>Try again</PopButton></div>}
      {openings.data && weekdays.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No shared openings to show yet.</p>}
      <ul className="mt-3 divide-y divide-crust/15">
        {weekdays.map((weekday) => (
          <li key={weekday} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
            <div className="min-w-0 flex-1 basis-40">
              <p className="font-extrabold">{weekdayLabel(weekday)}</p>
              {openings.data?.openings.filter((w) => w.weekday === weekday).map((w) => <p key={w.startSlot} className="text-sm font-medium">{openingTime(w.startSlot)} – {openingTime(w.endSlot)}</p>)}
            </div>
            <PopButton tone="chartreuse" className="!w-auto shrink-0 px-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-crust" aria-label={`Poke group for ${weekdayLabel(weekday)}`} disabled={poke.isPending || !openings.data?.canPoke} onClick={() => poke.mutate(weekday)}>
              <span className="flex items-center justify-center gap-2"><BellRing aria-hidden="true" className="h-4 w-4" />{poke.isPending && poke.variables === weekday ? "Sending…" : "Poke"}</span>
            </PopButton>
          </li>
        ))}
      </ul>
      {openings.data && !openings.data.canPoke && weekdays.length > 0 && !message && <p className="mt-2 text-sm text-muted-foreground">Group poked recently. Another poke will be available soon.</p>}
      {message && <p role={poke.isError ? "alert" : "status"} className="mt-2 text-sm font-semibold">{message}</p>}
    </div>
  );
}