import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
import { JoinRoom } from "./JoinRoom";

beforeEach(() => navigate.mockReset().mockResolvedValue(undefined));
afterEach(cleanup);

function open(input: string, username = "SesameSam") {
  render(<JoinRoom username={username} />);
  const field = screen.getByRole("textbox", { name: "Party code or invite link" });
  fireEvent.change(field, { target: { value: input } });
  return field;
}

describe("signed-in join from the dashboard", () => {
  it.each([" ab-c123 ", "https://baggel.example/party/abc123"])("opens the account join route for %s", async (input) => {
    open(input);
    fireEvent.click(screen.getByRole("button", { name: "Join party" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({
      to: "/journey/join/$code", params: { code: "ABC123" },
    }));
  });

  it.each([["abc12", "SesameSam"], ["ABC123", ""]])("requires a valid invitation and username", (input, username) => {
    const field = open(input, username);
    expect(screen.getByRole("button", { name: "Join party" })).toBeDisabled();
    fireEvent.submit(field.closest("form")!);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("deduplicates submit while navigating and retains input on failure", async () => {
    let reject: (error: Error) => void = () => {};
    navigate.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const field = open("ABC123");
    fireEvent.submit(field.closest("form")!);
    fireEvent.submit(field.closest("form")!);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(field).toBeDisabled();
    reject(new Error("Navigation failed"));
    await screen.findByRole("alert");
    expect(field).toHaveValue("ABC123");
    fireEvent.click(screen.getByRole("button", { name: "Join party" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
  });
});
