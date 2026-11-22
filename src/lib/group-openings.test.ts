import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
import { groupOpeningsSchema, openingTime, pokeGroup } from "./group-openings";
beforeEach(() => vi.resetAllMocks());

it("rejects any individual schedule or member-derived payload in the shared contract", () => {
  const shared = { ok: true, openings: [{ weekday: 1, startSlot: 30, endSlot: 32 }], canPoke: true };
  expect(groupOpeningsSchema.safeParse(shared).success).toBe(true);
  expect(groupOpeningsSchema.safeParse({ ...shared, schedules: [{ user_id: "someone", busy_slots: [30] }] }).success).toBe(false);
  expect(groupOpeningsSchema.safeParse({ ...shared, openings: [{ ...shared.openings[0], user_id: "someone" }] }).success).toBe(false);
});

it("keeps after-midnight labels attached to the recurring weekday", () => {
  expect(openingTime(48)).toBe("12:00 am next day");
  expect(openingTime(59)).toBe("5:30 am next day");
  expect(openingTime(60)).toBe("6:00 am next day");
});

it("pokes through the real group action contract and only succeeds on confirmed response", async () => {
  mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
  expect(await pokeGroup("group-id", 1)).toEqual({ ok: true });
  expect(mocks.rpc).toHaveBeenCalledWith("group_weekly_action", { p_action: "poke", p_group: "group-id", p_weekday: 1 });
  mocks.rpc.mockResolvedValue({ data: { ok: false, error: "no_opening" }, error: null });
  await expect(pokeGroup("group-id", 1)).rejects.toThrow("opening changed");
});

it("rejects invalid recurring weekday pokes before making a request", async () => {
  await expect(pokeGroup("group-id", 8)).rejects.toThrow();
  expect(mocks.rpc).not.toHaveBeenCalled();
});