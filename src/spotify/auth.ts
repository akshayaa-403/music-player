/**
 * Spotify Authorization Code + PKCE. PKCE replaces the client secret with a
 * per-login verifier, so no secret is ever shipped to (or needed by) the browser.
 */
const CLIENT_ID: string = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '';
const REDIRECT_URI = (): string =>
  import.meta.env.VITE_SPOTIFY_REDIRECT_URI || `${window.location.origin}/callback`;

const SCOPES = [
  'streaming', // Web Playback SDK
  'user-read-email',
  'user-read-private', // tells us whether the account is Premium
  'user-read-playback-state',
  'user-modify-playback-state',
];

const TOKEN_KEY = 'hm.spotify.token';
const VERIFIER_KEY = 'hm.spotify.verifier';
const STATE_KEY = 'hm.spotify.state';

interface StoredToken {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
}

export const isAuthConfigured = () => CLIENT_ID.length > 0;
export const redirectUri = REDIRECT_URI;

function randomString(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function beginLogin(): Promise<void> {
  if (!isAuthConfigured()) throw new Error('VITE_SPOTIFY_CLIENT_ID is not set.');
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    scope: SCOPES.join(' '),
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

/**
 * If the current URL is the OAuth redirect, exchange the code for tokens and
 * clean the URL. Returns an error message on failure, null otherwise.
 */
let redirectHandling: Promise<string | null> | null = null;

// Idempotent: React StrictMode runs boot effects twice, and the code can only be exchanged once.
export function completeLoginIfRedirect(): Promise<string | null> {
  redirectHandling ??= handleRedirect();
  return redirectHandling;
}

async function handleRedirect(): Promise<string | null> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return null;

  const cleanUrl = () => window.history.replaceState({}, '', '/');
  if (error) {
    cleanUrl();
    return error === 'access_denied' ? 'Spotify login was cancelled.' : `Spotify login failed: ${error}`;
  }

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  cleanUrl();
  if (!verifier || url.searchParams.get('state') !== expectedState) {
    return 'Login session expired or state mismatch — please try logging in again.';
  }

  try {
    await requestToken({
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: REDIRECT_URI(),
      client_id: CLIENT_ID,
      code_verifier: verifier,
    });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Token exchange failed.';
  }
}

async function requestToken(body: Record<string, string>): Promise<StoredToken> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Spotify token error: ${json.error_description ?? json.error ?? res.status}`);
  const prev = readToken();
  const token: StoredToken = {
    access_token: json.access_token,
    // Spotify may omit refresh_token on refresh; keep the previous one.
    refresh_token: json.refresh_token ?? prev?.refresh_token ?? '',
    expires_at: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  return token;
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

export const hasSession = () => readToken() !== null;

let refreshing: Promise<StoredToken> | null = null;

/** Returns a valid access token, refreshing ~60s before expiry. Null when logged out. */
export async function getAccessToken(): Promise<string | null> {
  const token = readToken();
  if (!token) return null;
  if (Date.now() < token.expires_at - 60_000) return token.access_token;
  if (!token.refresh_token) {
    logout();
    return null;
  }
  refreshing ??= requestToken({
    grant_type: 'refresh_token',
    refresh_token: token.refresh_token,
    client_id: CLIENT_ID,
  }).finally(() => {
    refreshing = null;
  });
  try {
    return (await refreshing).access_token;
  } catch {
    logout();
    return null;
  }
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
}
