/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Origin of the API (scheme + host + port), baked in at build time.
   * Empty/unset → relative `/api/...` (Vite dev proxy).
   * Set → absolute cross-site origin (GitHub Pages → Cloudflare Tunnel).
   * See specs/deploy-contract.md §1.1.
   */
  readonly VITE_API_BASE_URL?: string;
}
