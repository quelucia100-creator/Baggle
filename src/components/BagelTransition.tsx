import { createContext, useContext, useState, type ReactNode } from "react";
import { BagelLoadingScreen } from "./BagelLoadingScreen";

const TransitionContext = createContext({ active: false, setActive: (_active: boolean) => {} });

export const useBagelTransition = () => useContext(TransitionContext);

/** Shared lifetime keeps a single rotating loader visible until navigation finishes. */
export function BagelTransitionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  return (
    <TransitionContext.Provider value={{ active, setActive }}>
      <div inert={active}>{children}</div>
      {active && <BagelLoadingScreen />}
    </TransitionContext.Provider>
  );
}