declare global {
  interface Window {
    __APP_CONFIG__?: { apiBaseUrl?: string };
  }
}

const DEFAULT_API_BASE_URL = 'http://localhost:8080';

/**
 * Where the backend lives. Set with the VITE_API_BASE_URL environment variable:
 *  - Docker: read when the container starts (written into /config.js), no rebuild needed.
 *  - npm run dev / npm run build: read by Vite from the environment or a .env file.
 */
export function getApiBaseUrl(): string {
  const runtime = typeof window !== 'undefined' ? window.__APP_CONFIG__?.apiBaseUrl : undefined;
  const buildTime = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return (runtime || buildTime || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

/** How often seat counts and applications are refreshed from the server. */
export const POLL_INTERVAL_MS = 3000;
