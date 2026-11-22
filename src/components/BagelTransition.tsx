import { createContext, useContext, useState, type ReactNode } from "react";
import { FallingBagels } from "./FallingBagels";

const TransitionContext = createContext({ active: false, setActive: (_active: boolean) => {} });

export const useBagelTransition = () => useContext(TransitionContext);

/** Shared lifetime keeps the rain visible until navigation actually finishes. */
export function BagelTransitionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  return (
    <TransitionContext.Provider value={{ active, setActive }}>
      <div inert={active}>{children}</div>
      {active && <FallingBagels />}
    </TransitionContext.Provider>
  );
}