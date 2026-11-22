import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { MemberWizardV3 } from "./v3/MemberWizardV3";
import { emptyMemberDraft, MEMBER_STEPS, type MemberDraft } from "./v3/member-model";
import type { AvailabilityDay } from "@/lib/account-availability-model";
import { calendarContext } from "./v3/test-utils";
const m = vi.hoisted(() => ({ rows: null as AvailabilityDay[] | null }));
vi.mock("./useAccountAvailability", () => ({ useAccountAvailability: () => m.rows }));
afterEach(() => { cleanup(); m.rows = null; });
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