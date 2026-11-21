import type { InputHTMLAttributes } from "react";

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-crust">{label}</span>
      <input
        {...props}
        className="h-12 w-full rounded-2xl border-2 border-crust bg-cream px-4 text-crust placeholder:text-muted-foreground focus:bg-offwhite focus:outline-none focus:ring-4 focus:ring-vista/40"
      />
    </label>
  );
}

export function PopButton({ tone = "tangerine", className = "", ...props }: { tone?: "tangerine" | "sage" | "vista" | "chartreuse" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const tones = { tangerine: "bg-tangerine", sage: "bg-sage", vista: "bg-vista", chartreuse: "bg-chartreuse" };
  return (
    <button
      {...props}
      className={`h-12 w-full rounded-full border-2 border-crust font-display font-extrabold text-crust shadow-pop pop-press disabled:opacity-50 disabled:pointer-events-none ${tones[tone]} ${className}`}
    />
  );
}
