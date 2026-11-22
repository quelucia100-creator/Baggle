/** A rejected dynamic import remains cached in the current document. Router
 * invalidation alone cannot fetch the fresh entry graph after a preview update.
 * Recovery is explicit, never an automatic reload that could loop or lose edits. */
export function isRouteModuleLoadError(error: unknown): boolean {
  return error instanceof Error && /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk .+ failed/i.test(error.message);
}

export function recoverRouteLoad(error: unknown, reload: () => void, retry: () => void) {
  if (isRouteModuleLoadError(error)) reload();
  else retry();
}