import { describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn(async () => ({ status: "collecting" })));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (validate: (input: unknown) => unknown) => ({
      handler:
        (handle: (input: { data: unknown }) => Promise<unknown>) =>
        async (input: { data: unknown }) =>
          handle({ data: validate(input.data) }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("./planning/service.server", () => ({ executePlanning: execute }));
import { server, updatePartyPlanning, updatePartyPlanningV3 } from "./planning.functions";

describe("Canonical planning endpoint", () => {
  it("exposes the same discoverable handler for both typed planning aliases", async () => {
    expect(updatePartyPlanning).toBe(server);
    expect(updatePartyPlanningV3).toBe(server);
    await updatePartyPlanning({ data: { action: "read", code: "ABC123", token: "a".repeat(64) } });
    expect(execute).toHaveBeenCalledWith({
      action: "read",
      code: "ABC123",
      token: "a".repeat(64),
      payload: {},
      schemaVersion: 2,
    });
  });
});
