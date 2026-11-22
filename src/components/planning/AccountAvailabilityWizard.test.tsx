import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { MemberWizardV3 } from "./v3/MemberWizardV3";
import { emptyMemberDraft, MEMBER_STEPS, type MemberDraft } from "./v3/member-model";
import type { AvailabilityDay } from "@/lib/account-availability-model";
import { calendarContext, party, guestId, v2State } from "./v3/test-utils";
import { PlanWizard } from "./PlanWizard";
import type { PlanStep } from "@/lib/planning/wizard";
const m = vi.hoisted(() => ({ rows: null as AvailabilityDay[] | null, saveDays: vi.fn() }));
vi.mock("./useAccountAvailability", () => ({ useAccountAvailability: () => m.rows }));
vi.mock("@/lib/planning-days", async (original) => ({ ...(await original<typeof import("@/lib/planning-days")>()), runPlanningDays: m.saveDays }));
afterEach(() => { cleanup(); m.rows = null; sessionStorage.clear(); vi.clearAllMocks(); });
function Harness() {
  const [draft, setDraft] = useState<MemberDraft>(() => ({ ...emptyMemberDraft(), vibes: ["chill_cozy"], ceiling: { kind: "cap", cad: 30 } }));
  return <MemberWizardV3 draft={draft} onDraft={setDraft} context={calendarContext} busy={false} canSave hasSaved={false} save={async () => true} onCancel={() => {}} initialStep={MEMBER_STEPS.indexOf("budget")} />;
}
it("skips the availability question for confirmed dashboard weekdays and allows private per-party editing", async () => {
  m.rows = [{ weekday: 2, busy: [18, 19], confirmed: true }, { weekday: 4, busy: [], confirmed: true }];
  render(<Harness />);
  await screen.findByText("Using your confirmed dashboard availability.");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("heading", { name: "Where are you starting from?" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit times for this party" }));
  expect(screen.getByRole("heading", { name: "When are you free?" })).toBeInTheDocument();
  expect(m.rows[0]?.busy).toEqual([18, 19]);
});
it("keeps the normal question for missing or unconfirmed weekdays", async () => {
  m.rows = [{ weekday: 2, busy: [], confirmed: false }];
  render(<Harness />); fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "When are you free?" })).toBeInTheDocument());
  expect(screen.queryByText("Using your confirmed dashboard availability.")).toBeNull();
});
it("skips the current planner's time step and submits the exact confirmed windows only with the final save", async () => {
  m.rows = [{ weekday: 2, busy: Array.from({ length: 60 }, (_, i) => i).filter((i) => i < 36 || i > 39), confirmed: true }];
  m.saveDays.mockResolvedValue({ hostReady: true });
  const finish = vi.fn();
  function CurrentWizard() {
    const [step, setStep] = useState<PlanStep>("budget");
    return <PlanWizard code="ABC123" party={{ ...party, isHost: false, selfId: guestId }} state={{ ...v2State, selfPreferences: null, config: { ...v2State.config, date: "2026-11-24", durationMin: 90 } }} days={{ dates: ["2026-11-24"], hostReady: true, selfWindows: null, revision: 1 }} step={step} goToStep={setStep} exit={() => {}} finish={finish} />;
  }
  render(<CurrentWizard />);
  await screen.findByText("Using your confirmed dashboard availability.");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("heading", { name: "How far will you go?" })).toBeInTheDocument();
  expect(m.saveDays).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("radio", { name: "Chill" }));
  fireEvent.click(screen.getByRole("button", { name: "Save my answers" }));
  await waitFor(() => expect(finish).toHaveBeenCalled());
  expect(m.saveDays).toHaveBeenCalledWith("ABC123", expect.objectContaining({ action: "save", windows: { "2026-11-24": [{ freeFrom: "18:00", freeTo: "20:00" }] }, preferences: expect.objectContaining({ freeFrom: "18:00", freeTo: "20:00" }) }));
});