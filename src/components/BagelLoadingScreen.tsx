import bagel from "@/assets/bagel-single.png.asset.json";

/** Shared visual for route loading and guest/account transitions. */
export function BagelLoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/30 px-6 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <img src={bagel.url} alt="" className="animate-bagel-spin w-28 drop-shadow-[6px_6px_0_var(--crust)] sm:w-36" />
      <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}