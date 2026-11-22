/** LOCAL DEMO ONLY entry point. Served exclusively by demo/vite.config.ts in dev mode. */
import { installNetworkGuard } from "./network-guard";

if (!import.meta.env.DEV) throw new Error("The Cookie Monster V3 demo is development-only.");
// Must run before any app module can issue a request.
installNetworkGuard();

const [{ StrictMode }, { createRoot }, { DemoApp }] = await Promise.all([
  import("react"),
  import("react-dom/client"),
  import("./DemoApp"),
  import("@/styles.css"),
]);
const scenario = new URLSearchParams(window.location.search).get("scenario");
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <DemoApp
      initialScenario={
        scenario === "multi" ||
        scenario === "overnight" ||
        scenario === "nomatch" ||
        scenario === "legacy"
          ? scenario
          : "tonight"
      }
    />
  </StrictMode>,
);
