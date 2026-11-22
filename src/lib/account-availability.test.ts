import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), upsert: vi.fn(), single: vi.fn(), deleteRow: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from } }));
import { accountAvailabilityQuery, saveAvailability, removeAvailability } from "./account-availability";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "current-owner" } }, error: null });
  const chain = { select: mocks.select, eq: mocks.eq, order: mocks.order, upsert: mocks.upsert, single: mocks.single, delete: mocks.deleteRow };
  mocks.from.mockReturnValue(chain); mocks.select.mockReturnValue(chain); mocks.eq.mockReturnValue(chain); mocks.upsert.mockReturnValue(chain); mocks.deleteRow.mockReturnValue(chain);
});

it("loads only the current account’s recurring availability and restores overnight slots", async () => {
  mocks.order.mockResolvedValue({ data: [{ weekday: 7, busy_slots: [48, 59], confirmed: true }], error: null });
  const query = accountAvailabilityQuery();
  const run = query.queryFn;
  if (typeof run !== "function") throw new Error("Missing availability reader");
  const result = await run({ client: {} as never, queryKey: query.queryKey, signal: new AbortController().signal, meta: undefined });
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "current-owner");
  expect(mocks.from).toHaveBeenCalledWith("account_weekly_availability");
  expect(result).toEqual([{ weekday: 7, busy: [48, 59], confirmed: true }]);
});

it("saves under the signed-in owner and returns only confirmed data read back", async () => {
  mocks.single.mockResolvedValue({ data: { weekday: 1, busy_slots: [59], confirmed: true }, error: null });
  expect(await saveAvailability({ weekday: 1, busy: [59], confirmed: true })).toEqual({ weekday: 1, busy: [59], confirmed: true });
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "current-owner", weekday: 1, busy_slots: [59] }), { onConflict: "user_id,weekday" });
  expect(mocks.upsert.mock.calls[0]?.[0]).not.toHaveProperty("available_date");
});

it("blocks signed-out writes before any availability access", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(saveAvailability({ weekday: 1, busy: [], confirmed: true })).rejects.toThrow("Please sign in");
  expect(mocks.from).not.toHaveBeenCalled();
});

it("does not report a rejected database write as saved", async () => {
  mocks.single.mockResolvedValue({ data: null, error: { message: "denied" } });
  await expect(saveAvailability({ weekday: 1, busy: [], confirmed: true })).rejects.toThrow("could not be saved");
});

it("scopes removals to both the current owner and the chosen weekday", async () => {
  mocks.eq.mockReturnValueOnce({ eq: mocks.eq }).mockResolvedValueOnce({ error: null });
  await removeAvailability(7);
  expect(mocks.eq).toHaveBeenNthCalledWith(1, "user_id", "current-owner");
  expect(mocks.eq).toHaveBeenNthCalledWith(2, "weekday", 7);
});

it("rejects invalid weekday writes and removals before accessing private storage", async () => {
  await expect(saveAvailability({ weekday: 8, busy: [], confirmed: true })).rejects.toThrow();
  await expect(removeAvailability(0)).rejects.toThrow();
  expect(mocks.from).not.toHaveBeenCalled();
});