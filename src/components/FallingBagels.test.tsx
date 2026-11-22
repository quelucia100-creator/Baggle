import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FallingBagels } from "./FallingBagels";
import { BagelTransitionProvider, useBagelTransition } from "./BagelTransition";
import { BagelLoader } from "./BagelLoader";

afterEach(cleanup);

it("announces loading while keeping falling bagels decorative", () => {
  const { container } = render(<FallingBagels />);
  const overlay = container.firstElementChild;
  expect(overlay).toHaveAttribute("role", "status");
  const drops = container.querySelectorAll("img.bagel-fall");
  expect(drops.length).toBeGreaterThanOrEqual(12);
  for (const drop of drops) {
    expect(drop).toHaveAttribute("alt", "");
    expect(drop).toHaveAttribute("aria-hidden", "true");
    expect(drop.getAttribute("src")).toContain("bagel");
  }
});

function PendingPage() {
  const { setActive } = useBagelTransition();
  return <>
    <button onClick={() => setActive(true)}>Start transition</button>
    <button onClick={() => setActive(false)}>Navigation finished</button>
    <BagelLoader label="Normal page loading" />
  </>;
}

it("replaces the normal pending loader for the entire falling transition", () => {
  render(<BagelTransitionProvider><PendingPage /></BagelTransitionProvider>);
  expect(screen.getByRole("status")).toHaveTextContent("Normal page loading");
  fireEvent.click(screen.getByText("Start transition"));
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.queryByText("Normal page loading")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading…");
  fireEvent.click(screen.getByText("Navigation finished"));
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Normal page loading");
});
