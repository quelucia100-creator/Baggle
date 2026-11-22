import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("./party", () => ({ membershipToken: () => "a".repeat(64) }));
import { isPlanningDaysUnavailable, planningDaysQuery, runPlanningDays } from "./planning-days";

beforeEach(() => rpc.mockReset());

describe("optional multi-day planning contract", () => {
  it("recognizes only the missing days function as an unavailable rollout", async () => {
    rpc.mockResolvedValue({ data: null, error: {
      code: "PGRST202", message: "Could not find the function public.party_plan_days in the schema cache",
    } });
    const error = await runPlanningDays("ABC123", { action: "read" }).catch((error: unknown) => error);
    expect(isPlanningDaysUnavailable(error)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("party_plan_days", {
      p_action: "read", p_code: "ABC123", p_token: "a".repeat(64), p_payload: {},
    });
  });

  it.each([
    { code: "42501", message: "Invalid membership capability" },
    { code: "PGRST202", message: "Could not find a different function" },
    { code: "PGRST000", message: "Database connection unavailable" },
  ])("does not bypass permissions or network errors: $code", async (failure) => {
    rpc.mockResolvedValue({ data: null, error: failure });
    const error = await runPlanningDays("ABC123", { action: "read" }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(isPlanningDaysUnavailable(error)).toBe(false);
  });

  it("validates installed responses and strips unexpected private fields", async () => {
    rpc.mockResolvedValue({ error: null, data: {
      dates: ["2026-11-25"], hostReady: true,
      selfWindows: { "2026-11-25": [{ freeFrom: "09:00", freeTo: "11:00" }] },
      otherMemberWindows: { private: "never projected" },
    } });
    const result = await runPlanningDays("ABC123", { action: "read" });
    expect(result).toEqual({ dates: ["2026-11-25"], hostReady: true,
      selfWindows: { "2026-11-25": [{ freeFrom: "09:00", freeTo: "11:00" }] },
    });
  });

  it("does not invent successful readiness when a response is malformed", async () => {
    rpc.mockResolvedValue({ error: null, data: { dates: [] } });
    await expect(runPlanningDays("ABC123", { action: "read" })).rejects.toThrow("temporarily unavailable");
  });

  it("keeps private windows and membership credentials out of cache keys and expires screen data", () => {
    const query = planningDaysQuery("ABC123");
    expect(query.queryKey).toEqual(["party-planning-days", "ABC123"]);
    expect(query.gcTime).toBe(0);
    expect(query.retry).toBe(false);
  });
});