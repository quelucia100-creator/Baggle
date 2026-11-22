import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PartyInviteQR, partyJoinUrl } from "./PartyInviteQR";
const qr = vi.hoisted(() => vi.fn());
vi.mock("qrcode.react", () => ({
  QRCodeSVG: (props: { value: string }) => {
    qr(props.value);
    return <svg aria-label="Party QR" />;
  },
}));
afterEach(() => {
  cleanup();
  qr.mockClear();
});
it("encodes only the current origin and join URL, never a membership token", () => {
  expect(partyJoinUrl("https://baggle.example", "ABC123")).toBe(
    "https://baggle.example/party/ABC123",
  );
  render(<PartyInviteQR code="ABC123" />);
  const expected = `${window.location.origin}/party/ABC123`;
  expect(qr).toHaveBeenCalledWith(expected);
  expect(screen.getByRole("link", { name: "Open this party invitation" })).toHaveAttribute(
    "href",
    expected,
  );
});
it("replaces the QR destination when the party changes", () => {
  const view = render(<PartyInviteQR code="ABC123" />);
  view.rerender(<PartyInviteQR code="XYZ789" />);
  expect(qr).toHaveBeenLastCalledWith(`${window.location.origin}/party/XYZ789`);
});
