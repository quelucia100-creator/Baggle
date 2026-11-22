/**
 * LOCAL DEMO ONLY. Blocks every network request that leaves this page's own origin
 * (Supabase, Lovable, Google APIs, fonts, analytics), so the demo cannot reach a real service.
 * Same-origin requests are only the local Vite dev server (modules, HMR).
 */
export const blockedRequests: string[] = [];
const listeners = new Set<() => void>();
export const onBlocked = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function isLocal(target: string | URL) {
  try {
    return new URL(target, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}
function block(target: string) {
  blockedRequests.push(target);
  for (const listener of listeners) listener();
  console.warn(`[local demo] blocked external request: ${target}`);
}

export function installNetworkGuard() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const target =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!isLocal(target)) {
      block(target);
      return Promise.reject(new TypeError("Blocked by the Cookie Monster local demo"));
    }
    return originalFetch(input, init);
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function open(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: [boolean?, string?, string?]
  ) {
    if (!isLocal(url)) {
      block(String(url));
      throw new TypeError("Blocked by the Cookie Monster local demo");
    }
    return (originalOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  if (navigator.sendBeacon)
    navigator.sendBeacon = (url: string | URL) => (block(String(url)), false);
  const OriginalSocket = window.WebSocket;
  window.WebSocket = class GuardedSocket extends OriginalSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const target = new URL(url, window.location.href);
      if (target.hostname !== window.location.hostname) {
        block(target.href);
        throw new TypeError("Blocked by the Cookie Monster local demo");
      }
      super(url, protocols);
    }
  };
}
