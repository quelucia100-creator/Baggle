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
  await waitFor(() => expect(save).toHaveBeenCalledWith({ date: "2026-11-22", busy: [], confirmed: true }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Availability saved."));
});

it("rehydrates saved times on edit and preserves them through confirmed save", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<AvailabilityEditor days={[{ date: "2026-11-22", busy: [48, 59], confirmed: true }]} onSave={save} onRemove={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Sun, Nov 22" }));
  expect(screen.getByLabelText("Confirm this day’s availability")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ date: "2026-11-22", busy: [48, 59], confirmed: true }));
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

it("saves the selected next-week weekday without changing this week's answers", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<AvailabilityEditor days={[{ date: "2026-11-22", busy: [48], confirmed: true }]} onSave={save} onRemove={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Monday" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Next week" }));
  fireEvent.click(screen.getByRole("button", { name: "Monday" }));
  expect(screen.getByLabelText("Confirm this day’s availability")).not.toBeChecked();
  fireEvent.click(screen.getByLabelText("Confirm this day’s availability"));
  fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ date: "2026-11-23", busy: [], confirmed: true }));
});