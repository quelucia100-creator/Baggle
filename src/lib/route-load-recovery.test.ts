import { describe, expect, it, vi } from "vitest";
import { isRouteModuleLoadError, recoverRouteLoad } from "./route-load-recovery";
describe("explicit route loading recovery", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://example.test/@oj-start/hmr/lazy?id=index",
    "Importing a module script failed.",
    "error loading dynamically imported module",
    "Loading chunk 12 failed.",
  ])("reloads the document for a cached module failure: %s", (message) => {
    const reload = vi.fn(), retry = vi.fn();
    recoverRouteLoad(new TypeError(message), reload, retry);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });
  it.each([new Error("Failed to fetch"), new Error("Preferences couldn't be saved"), null])("keeps ordinary failures in place to preserve drafts", (error) => {
    const reload = vi.fn(), retry = vi.fn();
    recoverRouteLoad(error, reload, retry);
    expect(reload).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(isRouteModuleLoadError(error)).toBe(false);
  });
});