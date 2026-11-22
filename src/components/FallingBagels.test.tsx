import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FallingBagels } from "./FallingBagels";

afterEach(cleanup);

it("rains a screen of decorative bagels hidden from assistive tech", () => {
  const { container } = render(<FallingBagels />);
  const overlay = container.firstElementChild;
  expect(overlay).toHaveAttribute("aria-hidden", "true");
  const drops = container.querySelectorAll("img.bagel-fall");
  expect(drops.length).toBeGreaterThanOrEqual(12);
  for (const drop of drops) {
    expect(drop).toHaveAttribute("alt", "");
    expect(drop.getAttribute("src")).toContain("bagel");
  }
});
