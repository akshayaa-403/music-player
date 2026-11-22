import { getAccessToken } from './auth';

export interface TrackMeta {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  album: string;
  albumArt: string | null;
  durationMs: number;
  isrc: string | null;
  popularity: number | null;
}

export interface SpotifyProfile {
  id: string;
  displayName: string;
  product: string; // 'premium' | 'free' | 'open'
}

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function spotifyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new SpotifyApiError('Not logged in to Spotify.', 401);
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new SpotifyApiError(body?.error?.message ?? `Spotify API ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function getProfile(): Promise<SpotifyProfile> {
  const me = await spotifyFetch<{ id: string; display_name: string | null; product?: string }>('/me');
  return { id: me.id, displayName: me.display_name ?? me.id, product: me.product ?? 'unknown' };
}

interface ApiTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  popularity?: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string; width: number }[] };
  external_ids?: { isrc?: string };
}

export async function getTrack(id: string): Promise<TrackMeta> {
  try {
    const t = await spotifyFetch<ApiTrack>(`/tracks/${id}`);
    const images = [...t.album.images].sort((a, b) => b.width - a.width);
    return {
      id: t.id,
      uri: t.uri,
      name: t.name,
      artists: t.artists.map((a) => a.name),
      album: t.album.name,
      albumArt: (images.find((i) => i.width <= 300) ?? images[0])?.url ?? null,
      durationMs: t.duration_ms,
      isrc: t.external_ids?.isrc ?? null,
      popularity: t.popularity ?? null,
    };
  } catch (e) {
    if (e instanceof SpotifyApiError && (e.status === 404 || e.status === 400)) {
      throw new SpotifyApiError('Spotify couldn’t find that track. Check the link and try again.', e.status);
    }
    throw e;
  }
}

/** Starts `uri` on the given Connect device (our Web Playback SDK player). */
export async function startPlayback(deviceId: string, uri: string, positionMs = 0): Promise<void> {
  const call = () =>
    spotifyFetch<void>(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      method: 'PUT',
      body: JSON.stringify({ uris: [uri], position_ms: Math.round(positionMs) }),
    });
  try {
    await call();
  } catch (e) {
    // A freshly-registered SDK device can take a moment to appear in Connect.
    if (e instanceof SpotifyApiError && (e.status === 404 || e.status === 502)) {
      await new Promise((r) => setTimeout(r, 800));
      await call();
    } else throw e;
  }
}
