import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { membershipToken, type PartyState } from "@/lib/party";
import { planningKey } from "@/lib/planning-client";
import { planningDaysReadiness, planningDaysKey, planningDaysQuery } from "@/lib/planning-days";
import { updatePartyPlanning } from "@/lib/planning.functions";
import type { PlanningRequest } from "@/lib/planning-v3/request";
import type { PlanningCommand } from "./model";
import type { PlanningCommandV3, VersionedPlanningState } from "./v3/contract";

type Command = PlanningCommand | PlanningCommandV3;
type PlanningCall = (options: {
  data: PlanningRequest;
  signal?: AbortSignal;
}) => Promise<VersionedPlanningState>;

export function planningRequest(
  command: Command,
  current: VersionedPlanningState | undefined,
  code: string,
  token: string,
): PlanningRequest {
  const bootstrap =
    command.action === "configure" && "version" in command.config && command.config.version === 3;
  if (bootstrap || current?.schemaVersion === 3)
    return { ...command, code, token, schemaVersion: 3 } as PlanningRequest;
  return { ...command, code, token, schemaVersion: 2 } as PlanningRequest;
}

export function usePartyWorkflow(code: string, enabled: boolean) {
  const client = useQueryClient();
  const planning = useServerFn(updatePartyPlanning as PlanningCall);
  const key = planningKey(code);
  const mutationKey = ["party-planning-change", code];
  const inFlight = useRef(false);
  const state = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      planning({
        data: { action: "read", code, token: membershipToken(), schemaVersion: 3 },
        ...(signal ? { signal } : {}),
      }),
    enabled,
    refetchInterval: () => (client.isMutating({ mutationKey }) ? false : 3000),
    retry: false,
    gcTime: 0,
  });
  const days = useQuery({ ...planningDaysQuery(code), enabled: enabled && !!state.data });
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: planningDaysKey(code) }),
    ]);
  const mutation = useMutation({
    mutationKey,
    gcTime: 0,
    mutationFn: (command: Command) =>
      planning({
        data: planningRequest(
          command,
          client.getQueryData<VersionedPlanningState>(key),
          code,
          membershipToken(),
        ),
      }),
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: async (data, command) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData(key, data);
      if (command.action !== "lock")
        void client.invalidateQueries({ queryKey: planningDaysKey(code) });
    },
    onError: refresh,
    retry: false,
  });
  const submit = async (command: Command) => {
    if (inFlight.current || client.isMutating({ mutationKey }) || state.isError) return;
    inFlight.current = true;
    try {
      return await mutation.mutateAsync(command);
    } catch {
      return;
    } finally {
      inFlight.current = false;
    }
  };
  return { state, days, mutation, submit, refresh };
}

export type PartyWorkflow = ReturnType<typeof usePartyWorkflow>;

export function workflowReadiness(party: PartyState, workflow: PartyWorkflow) {
  const { state, days } = workflow;
  const active = new Set(party.members.map((member) => member.id));
  const ready =
    state.data?.members.filter((member) => member.submitted && active.has(member.id)) ?? [];
  const host = party.members.find((member) => member.host);
  const selfReady = ready.some((member) => member.id === party.selfId);
  const daysReadiness = planningDaysReadiness(days.data, days.error);
  const hostReady =
    !state.isError &&
    daysReadiness === "ready" &&
    days.data?.hostReady === true &&
    ready.some((member) => member.id === host?.id) &&
    (days.data.schemaVersion === undefined ||
      days.data.schemaVersion === (state.data?.schemaVersion ?? 2)) &&
    (days.data.revision === undefined || days.data.revision === state.data?.revision);
  // Existing saved V2 parties still have a verified roster during the days RPC rollout.
  const legacyReady =
    !state.isError &&
    !days.data &&
    daysReadiness === "unavailable" &&
    state.data?.schemaVersion !== 3 &&
    ready.some((member) => member.id === host?.id);
  return { ready: ready.length, selfReady, hostReady, legacyReady };
}
