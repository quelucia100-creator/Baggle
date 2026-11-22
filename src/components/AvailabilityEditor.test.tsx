import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AvailabilityEditor } from "./AvailabilityEditor";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-22T05:00:00Z")); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("asks for a weekday first and requires confirmation before saving", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<AvailabilityEditor days={[]} onSave={save} onRemove={vi.fn()} />);
  expect(screen.queryByLabelText("Confirm this day’s availability")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sunday" }));
  fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Confirm this day");
  fireEvent.click(screen.getByLabelText("Confirm this day’s availability"));
  fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ weekday: 7, busy: [], confirmed: true }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Availability saved."));
});

it("rehydrates saved times on edit and preserves them through confirmed save", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<AvailabilityEditor days={[{ weekday: 7, busy: [48, 59], confirmed: true }]} onSave={save} onRemove={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Sunday" }));
  expect(screen.getByLabelText("Confirm this day’s availability")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ weekday: 7, busy: [48, 59], confirmed: true }));
});

it("does not show success before the save resolves and keeps answers on failure", async () => {
  let reject: (reason: Error) => void = () => {};
  const save = vi.fn(() => new Promise<void>((_resolve, rejectSave) => { reject = rejectSave; }));
  render(<AvailabilityEditor days={[]} onSave={save} onRemove={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Sunday" }));
  fireEvent.click(screen.getByLabelText("Confirm this day’s availability"));
  fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
  expect(screen.queryByText("Availability saved.")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  reject(new Error("Save failed"));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Save failed"));
  expect(screen.getByLabelText("Confirm this day’s availability")).toBeChecked();
});

it("preserves screen-local answers when going Back without pretending they are saved", () => {
  const save = vi.fn();
  render(<AvailabilityEditor days={[]} onSave={save} onRemove={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Sunday" }));
  fireEvent.click(screen.getByLabelText("Confirm this day’s availability"));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sunday" }));
  expect(screen.getByLabelText("Confirm this day’s availability")).toBeChecked();
});

it("saves Monday as a recurring weekday without changing Sunday's answers", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<AvailabilityEditor days={[{ weekday: 7, busy: [48], confirmed: true }]} onSave={save} onRemove={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Monday" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Monday" }));
  expect(screen.getByLabelText("Confirm this day’s availability")).not.toBeChecked();
  fireEvent.click(screen.getByLabelText("Confirm this day’s availability"));
  fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ weekday: 1, busy: [], confirmed: true }));
});

it("allows early and overnight clock slots even when the current date is years later", async () => {
  vi.setSystemTime(new Date("2035-06-21T18:00:00Z"));
  const save = vi.fn().mockResolvedValue(undefined);
  render(<AvailabilityEditor days={[]} onSave={save} onRemove={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Monday" }));
  fireEvent.click(screen.getByRole("button", { name: "12:00 AM to 12:30 AM, free" }));
  fireEvent.click(screen.getByRole("button", { name: "5:30 AM to 6:00 AM (next day), free" }));
  fireEvent.click(screen.getByLabelText("Confirm this day’s availability"));
  fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ weekday: 1, busy: [0, 59], confirmed: true }));
});

it("removes only the chosen recurring weekday after confirmation from the server", async () => {
  const remove = vi.fn().mockResolvedValue(undefined);
  render(<AvailabilityEditor days={[{ weekday: 3, busy: [8], confirmed: true }]} onSave={vi.fn()} onRemove={remove} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove Wednesday" }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith(3));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Day removed."));
});

it("commits a captured pointer tap once and still allows keyboard toggling", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<AvailabilityEditor days={[]} onSave={save} onRemove={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Monday" }));
  const cell = screen.getByRole("button", { name: "12:00 AM to 12:30 AM, free" });
  const grid = screen.getByRole("group", { name: "Busy times on Monday, Montréal time" });
  fireEvent.pointerDown(cell, { pointerId: 1, pointerType: "mouse", button: 0 });
  fireEvent.pointerUp(grid, { pointerId: 1, pointerType: "mouse" });
  fireEvent.click(cell);
  expect(cell).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(cell);
  expect(cell).toHaveAttribute("aria-pressed", "false");
  fireEvent.pointerDown(cell, { pointerId: 2, pointerType: "touch" });
  fireEvent.pointerUp(grid, { pointerId: 2, pointerType: "touch" });
  fireEvent.click(cell);
  fireEvent.click(screen.getByLabelText("Confirm this day’s availability"));
  fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ weekday: 1, busy: [0], confirmed: true }));
});