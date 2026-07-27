/// <reference types="vite/client" />

// PlayerTicker frontend environment (Phase 10).
//
// One knob connects the browser to the internal HTTP API. See
// docs/FRONTEND_API_CONTRACT.md for how it is resolved and what happens when it is unset.
interface ImportMetaEnv {
  /**
   * Base URL of the PlayerTicker internal HTTP API.
   *
   * Absolute (`https://api.example.com`) for a cross-origin backend — which requires the API
   * server to allow this app's origin — or a path prefix (`/api`) to go through a same-origin
   * proxy. Trailing slashes are normalized away.
   *
   * Unset → `/api` in `vite dev` (proxied by vite.config.ts), and the app's own origin in a
   * production build. No host or port is ever hard-coded in frontend source.
   */
  readonly VITE_PLAYERTICKER_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
