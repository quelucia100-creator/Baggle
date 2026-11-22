import { z } from "zod";

const guestEntrySchema = z.object({
  name: z.string().trim().min(1).max(30),
  code: z.string().regex(/^[A-Z0-9]{6}$/),
}).strict();
export type GuestEntry = z.infer<typeof guestEntrySchema>;
const key = "baggle-last-guest-entry";

/** Navigation convenience only; membership credentials remain in party.ts. */
export function readGuestEntry(): GuestEntry | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const result = guestEntrySchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function rememberGuestEntry(entry: GuestEntry): void {
  const result = guestEntrySchema.safeParse(entry);
  if (!result.success) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(result.data));
  } catch {
    // Unavailable storage must never prevent an otherwise valid party entry.
  }
}