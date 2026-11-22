import type { AudioFeatureProvider, MusicalFeatures } from './types';

/**
 * ReccoBeats public API — looks tracks up by Spotify ID and returns
 * Spotify-style audio features. The response shape is parsed defensively;
 * anything unexpected yields null and the resolver falls through.
 */
const ENDPOINT = 'https://api.reccobeats.com/v1/audio-features';

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export const reccoBeatsProvider: AudioFeatureProvider = {
  label: 'ReccoBeats audio features',
  async getFeatures(track, { signal }) {
    const res = await fetch(`${ENDPOINT}?ids=${encodeURIComponent(track.id)}`, { signal });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const list = (json as { content?: unknown[] })?.content;
    const item = Array.isArray(list) ? (list[0] as Record<string, unknown> | undefined) : undefined;
    if (!item) return null;

    const out: Partial<MusicalFeatures> = {};
    const set = <K extends keyof MusicalFeatures>(k: K, v: MusicalFeatures[K] | undefined) => {
      if (v !== undefined) out[k] = v;
    };
    set('tempo', num(item.tempo));
    const key = num(item.key);
    set('key', key !== undefined && key >= 0 && key <= 11 ? Math.round(key) : undefined);
    const mode = num(item.mode);
    set('mode', mode === undefined ? undefined : mode === 0 ? 0 : 1);
    set('energy', num(item.energy));
    set('loudness', num(item.loudness));
    set('danceability', num(item.danceability));
    set('valence', num(item.valence));
    set('acousticness', num(item.acousticness));
    set('instrumentalness', num(item.instrumentalness));
    return Object.keys(out).length ? out : null;
  },
};
