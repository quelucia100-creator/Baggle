import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), user: null as null | { id: string } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: m.from, auth: { getSession: async () => ({ data: { session: m.user ? { user: m.user } : null } }) } } }));
import { useAccountAvailability } from "./useAccountAvailability";
beforeEach(() => { vi.clearAllMocks(); m.user = null; m.from.mockReturnValue({ select: m.select }); m.select.mockReturnValue({ eq: m.eq }); m.eq.mockResolvedValue({ data: [{ weekday: 2, busy_slots: [18, 19], confirmed: true }, { weekday: 3, busy_slots: [], confirmed: false }], error: null }); });
afterEach(cleanup);
it("reads only the signed-in owner's confirmed weekdays into screen-local state", async () => {
  m.user = { id: "account-owner" };
  const { result } = renderHook(useAccountAvailability);
  await waitFor(() => expect(result.current).toEqual([{ weekday: 2, busy: [18, 19], confirmed: true }]));
  expect(m.eq).toHaveBeenCalledWith("user_id", "account-owner");
  expect(m.from).toHaveBeenCalledWith("account_weekly_availability");
});
it("does not read account schedules for guests", async () => {
  const { result } = renderHook(useAccountAvailability);
  await waitFor(() => expect(result.current).toBeNull());
  expect(m.from).not.toHaveBeenCalled();
});