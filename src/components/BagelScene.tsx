import type { ReactNode } from "react";
import single from "@/assets/bagel-single.png.asset.json";
import cream from "@/assets/bagel-cream.png.asset.json";

const bagels = [
  { src: single.url, cls: "top-[6%] left-[10%] w-40", r: "-12deg", d: "0s" },
  { src: cream.url, cls: "top-[14%] right-[8%] w-56", r: "10deg", d: "1.2s" },
  { src: single.url, cls: "top-[44%] left-[38%] w-28", r: "30deg", d: "2.1s" },
  { src: cream.url, cls: "bottom-[10%] left-[6%] w-52", r: "-20deg", d: "0.6s" },
  { src: single.url, cls: "bottom-[6%] right-[14%] w-44", r: "18deg", d: "1.7s" },
  { src: single.url, cls: "top-[62%] right-[40%] w-20", r: "-30deg", d: "2.6s" },
];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-tangerine">
      <aside className="paper-sheet relative z-10 flex w-full flex-col justify-center border-r-4 border-crust bg-offwhite px-6 py-10 sm:px-12 lg:w-[44%] lg:max-w-[600px]">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </aside>
      <section
        aria-hidden="true"
        className="paper-sheet relative hidden flex-1 overflow-hidden bg-offwhite lg:block"
      >
        {bagels.map((b, i) => (
          <img
            key={i}
            src={b.src}
            alt=""
            className={`absolute animate-bob drop-shadow-[8px_12px_10px_rgba(60,30,0,0.35)] ${b.cls}`}
            style={{ ["--r" as string]: b.r, animationDelay: b.d }}
          />
        ))}
        <div className="paper absolute bottom-10 left-1/2 -translate-x-1/2 rotate-[-3deg] rounded-full border-4 border-crust bg-chartreuse px-6 py-3 font-display text-xl font-extrabold text-crust shadow-pop-lg">
          Who's free? What's the plan?
        </div>
      </section>
    </div>
  );
}
