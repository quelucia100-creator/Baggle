import bagel from "@/assets/bagel-single.png.asset.json";
import { useBagelTransition } from "./BagelTransition";

/** Full-screen loading state: the bagel spins on itself while a page loads. */
export function BagelLoader({ label = "Loading…" }: { label?: string }) {
  const { active } = useBagelTransition();
  if (active) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/30 px-6 backdrop-blur-xl"
      role="status"
      aria-live="polite"
    >
      <img
        src={bagel.url}
        alt=""
        className="animate-bagel-spin w-28 drop-shadow-[6px_6px_0_var(--crust)] sm:w-36"
      />
      <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
