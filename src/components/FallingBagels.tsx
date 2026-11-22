import { useMemo } from "react";
import bagelPlain from "@/assets/bagel-single.png.asset.json";
import bagelCream from "@/assets/bagel-cream.png.asset.json";

type Drop = {
  left: number;
  size: number;
  duration: number;
  delay: number;
  spin: number;
  src: string;
};

/** Full-screen celebratory transition: bagels rain down while the next page loads. */
export function FallingBagels() {
  const drops = useMemo<Drop[]>(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        left: (i * 61) % 100 + Math.random() * 4,
        size: 44 + Math.random() * 56,
        duration: 1.1 + Math.random() * 0.9,
        delay: Math.random() * 0.5,
        spin: (Math.random() > 0.5 ? 1 : -1) * (240 + Math.random() * 240),
        src: i % 3 === 2 ? bagelCream.url : bagelPlain.url,
      })),
    [],
  );

  return (
    <div className="paper fixed inset-0 z-50 overflow-hidden bg-background" role="status" aria-live="polite" aria-label="Loading…">
      <span className="sr-only">Loading…</span>
      {drops.map((d, i) => (
        <img
          key={i}
          src={d.src}
          alt=""
          aria-hidden="true"
          className="bagel-fall absolute -top-28"
          style={{
            left: `${d.left}%`,
            width: d.size,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
            ["--spin" as string]: `${d.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
