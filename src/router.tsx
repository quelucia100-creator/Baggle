import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { BagelLoader } from "./components/BagelLoader";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPendingComponent: BagelLoader,
    // Avoid flashing the spinner on fast loads.
    defaultPendingMs: 200,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
