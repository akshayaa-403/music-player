import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * BASE_PATH sets the sub-path the app is served from. GitHub Pages project sites
 * live at https://<user>.github.io/<repo>/, so the deploy workflow builds with
 * BASE_PATH=/<repo>/. Local dev and preview stay at the root unless it's set.
 */
function normalizeBase(raw: string | undefined): string {
  const trimmed = raw?.trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

// Spotify no longer accepts `localhost` redirect URIs; it requires the
// loopback IP. Serving on 127.0.0.1 keeps the redirect URI and origin aligned.
export default defineConfig(({ mode }) => {
  // Prefix '' also pulls in plain process.env vars such as BASE_PATH from CI.
  const env = loadEnv(mode, '.', '');
  return {
    base: normalizeBase(env.BASE_PATH),
    plugins: [react(), tailwindcss()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '127.0.0.1', port: 5173, strictPort: true },
    build: { sourcemap: true, target: 'es2022' },
  };
});
