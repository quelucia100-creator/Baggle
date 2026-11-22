import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useParams: () => ({ code: "ABC123" }) }),
  Navigate: (props: unknown) => { redirect(props); return <p role="status">Opening plan</p>; },
}));
import { Route } from "@/routes/party.$code_.map";

afterEach(() => { cleanup(); redirect.mockClear(); });
it("replaces an old map URL with the matching plan without changing membership or journey state", () => {
  const Component = Route.options.component as ComponentType;
  render(<Component />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(redirect).toHaveBeenCalledWith({
    to: "/party/$code/plan", params: { code: "ABC123" }, search: {}, replace: true,
  });
});