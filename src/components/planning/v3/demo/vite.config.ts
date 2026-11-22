/**
 * LOCAL DEMO ONLY — a standalone Vite dev server for the V3 planning screens.
 *
 *   npx vite --config src/components/planning/v3/demo/vite.config.ts
 *
 * - Separate from the app's TanStack Start config; nothing in src/routes imports the demo,
 *   so `npm run build` never includes it. Building this config is refused outright.
 * - Loads no .env file and exposes no env vars, so no Supabase/Lovable keys reach the page.
 * - Aliases every server/Supabase/RPC module to a stub that throws if imported.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../../..");
const forbidden = path.resolve(here, "forbidden.ts");

export default defineConfig(({ command }) => {
  if (command !== "serve")
    throw new Error("The Cookie Monster V3 demo is development-only and cannot be built.");
  return {
    root: here,
    // No .env lives here, and no prefix is exposed: import.meta.env carries no secrets.
    envDir: here,
    envPrefix: "COOKIE_MONSTER_LOCAL_DEMO_NEVER_",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: /^@\/integrations\/supabase(\/.*)?$/, replacement: forbidden },
        { find: /^@\/lib\/party$/, replacement: forbidden },
        { find: /^@\/lib\/planning\.functions$/, replacement: forbidden },
        { find: /^@\/lib\/planning\/service\.server$/, replacement: forbidden },
        { find: /^@\/lib\/planning-v3\/.*\.server$/, replacement: forbidden },
        { find: /^@supabase\/.*/, replacement: forbidden },
        { find: /^@tanstack\/react-start(\/.*)?$/, replacement: forbidden },
        { find: /^@\//, replacement: `${src}/` },
      ],
    },
    server: {
      host: "127.0.0.1",
      port: 5199,
      strictPort: true,
      fs: { allow: [path.resolve(src, "..")] },
    },
    build: { target: "es2022" },
  };
});
