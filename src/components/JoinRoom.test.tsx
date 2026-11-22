import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ join: vi.fn(), navigate: vi.fn() }));
vi.mock("@/lib/party", () => ({ accessParty: mocks.join }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
import { JoinRoom } from "./JoinRoom";

let client: QueryClient;
const joined = { code: "ABC123", selfId: "member", isHost: false, members: [] };
function open(username = "SesameSam") {
  client = new QueryClient();
  render(<QueryClientProvider client={client}><JoinRoom username={username} /></QueryClientProvider>);
}
beforeEach(() => { mocks.join.mockReset().mockResolvedValue(joined); mocks.navigate.mockReset().mockResolvedValue(undefined); });
afterEach(() => { cleanup(); client?.clear(); });

describe("signed-in join by code", () => {
  it("requires a six-character room code before joining", () => {
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Room code" }), { target: { value: "abc12" } });
    expect(screen.getByRole("button", { name: "Join room" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("textbox").closest("form") as HTMLFormElement);
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it("normalizes a pasted code, uses the account name, and opens the confirmed room", async () => {
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Room code" }), { target: { value: " ab-c123 " } });
    fireEvent.click(screen.getByRole("button", { name: "Join room" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/party/$code", params: { code: "ABC123" }, replace: true }));
    expect(mocks.join).toHaveBeenCalledWith("join", "ABC123", "SesameSam");
    expect(client.getQueryData(["party", "ABC123"])).toEqual(joined);
  });

  it("waits for confirmation and prevents duplicate joins", async () => {
    let resolve: ((value: typeof joined) => void) | undefined;
    mocks.join.mockImplementation(() => new Promise<typeof joined>((done) => { resolve = done; }));
    open();
    const input = screen.getByRole("textbox", { name: "Room code" });
    fireEvent.change(input, { target: { value: "ABC123" } });
    const form = input.closest("form");
    if (!form) throw new Error("Join form missing");
    fireEvent.submit(form); fireEvent.submit(form);
    expect(mocks.join).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(input).toBeDisabled();
    resolve?.(joined);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
  });

  it.each(["Party not found.", "This party is full.", "The host is still setting up this hangout."])("keeps the code and supports retry after a rejection: %s", async (message) => {
    mocks.join.mockRejectedValueOnce(new Error(message));
    open();
    const input = screen.getByRole("textbox", { name: "Room code" });
    fireEvent.change(input, { target: { value: "ABC123" } });
    fireEvent.click(screen.getByRole("button", { name: "Join room" }));
    await screen.findByRole("alert");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(input).toHaveValue("ABC123");
    fireEvent.click(screen.getByRole("button", { name: "Join room" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
  });

  it("never invents an account name when preferences are missing", () => {
    open("");
    fireEvent.change(screen.getByRole("textbox", { name: "Room code" }), { target: { value: "ABC123" } });
    expect(screen.getByRole("button", { name: "Join room" })).toBeDisabled();
    expect(mocks.join).not.toHaveBeenCalled();
  });
});