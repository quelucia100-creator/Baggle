import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("./party", () => ({ membershipToken: () => "a".repeat(64) }));
import { hasPendingGroupInvite, rememberGroupInvite, sendPendingGroupInvite } from "./pending-group-invite";

const group = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { sessionStorage.clear(); rpc.mockReset(); });

describe("chosen group invitation recovery", () => {
  it("sends only a remembered group and clears it only after confirmation", async () => {
    rememberGroupInvite("ABC123", group);
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await sendPendingGroupInvite("ABC123")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("invite_group_to_journey", { p_group: group, p_code: "ABC123", p_token: "a".repeat(64) });
    expect(hasPendingGroupInvite("ABC123")).toBe(false);
    expect(await sendPendingGroupInvite("ABC123")).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("retains the chosen group when the host is not ready or delivery fails", async () => {
    rememberGroupInvite("ABC123", group);
    rpc.mockResolvedValue({ data: { ok: false, error: "host_not_ready" }, error: null });
    expect(await sendPendingGroupInvite("ABC123")).toBe(false);
    expect(hasPendingGroupInvite("ABC123")).toBe(true);
    rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    expect(await sendPendingGroupInvite("ABC123")).toBe(false);
    expect(hasPendingGroupInvite("ABC123")).toBe(true);
  });

  it("never sends an invitation for another party or an invalid choice", async () => {
    rememberGroupInvite("ABC123", group);
    rememberGroupInvite("XYZ789", "invalid");
    expect(await sendPendingGroupInvite("XYZ789")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(hasPendingGroupInvite("ABC123")).toBe(true);
  });
});