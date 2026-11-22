import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BagelTransitionProvider, useBagelTransition } from "./BagelTransition";
import { BagelLoader } from "./BagelLoader";

afterEach(cleanup);

function PendingPage() {
  const { setActive } = useBagelTransition();
  return <>
    <button onClick={() => setActive(true)}>Start transition</button>
    <button onClick={() => setActive(false)}>Navigation finished</button>
    <BagelLoader label="Normal page loading" />
  </>;
}

it("keeps one loading status throughout transition and restores route loading when finished", () => {
  render(<BagelTransitionProvider><PendingPage /></BagelTransitionProvider>);
  expect(screen.getByRole("status")).toHaveTextContent("Normal page loading");
  fireEvent.click(screen.getByText("Start transition"));
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.queryByText("Normal page loading")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  fireEvent.click(screen.getByText("Navigation finished"));
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Normal page loading");
});