import { BagelLoadingScreen } from "./BagelLoadingScreen";
import { useBagelTransition } from "./BagelTransition";

/** Full-screen loading state: the bagel spins on itself while a page loads. */
export function BagelLoader({ label = "Loading…" }: { label?: string }) {
  const { active } = useBagelTransition();
  if (active) return null;
  return <BagelLoadingScreen label={label} />;
}
