import { clamp, hashString, mulberry32 } from '../lib/random';
import type { TrackMeta } from '../spotify/api';
import { deriveFeatures, deriveSections, derivedProvider } from './derivedProvider';
import { reccoBeatsProvider } from './reccoBeatsProvider';
import { spotifyProvider } from './spotifyProvider';
import {
  FEATURE_FIELDS,
  type AudioFeatureProvider,
  type FeatureField,
  type MusicalFeatures,
  type ResolvedFeatures,
} from './types';

/** Providers in priority order; the derived fallback is always appended last. */
export function defaultProviders(opts: { spotify: boolean }): AudioFeatureProvider[] {
  const list: AudioFeatureProvider[] = [];
  if (opts.spotify) list.push(spotifyProvider);
  if (import.meta.env.VITE_DISABLE_RECCOBEATS !== 'true') list.push(reccoBeatsProvider);
  return list;
}

/** Rejects out-of-range values so a bad provider can't break the geometry. */
function isValid(field: FeatureField, v: unknown): boolean {
  if (field === 'sections') return Array.isArray(v) && v.length > 0;
  if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  switch (field) {
    case 'tempo':
      return v >= 30 && v <= 300;
    case 'key':
      return v >= 0 && v <= 11;
    case 'mode':
      return v === 0 || v === 1;
    case 'timeSignature':
      return v >= 2 && v <= 9;
    case 'loudness':
      return v >= -60 && v <= 5;
    default:
      return v >= 0 && v <= 1;
  }
}

const TIMEOUT_MS = 4000;

export async function resolveFeatures(
  track: TrackMeta,
  providers: AudioFeatureProvider[],
): Promise<ResolvedFeatures> {
  const results = await Promise.all(
    providers.map(async (p) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        return await p.getFeatures(track, { signal: ctrl.signal });
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return mergeFeatures(track, providers, results);
}

/** Metadata-only features, synchronously (demo / idle screen). */
export const derivedFeatures = (track: TrackMeta) => mergeFeatures(track, [], []);

/** Higher-priority providers win field by field; gaps come from the derived fallback. */
export function mergeFeatures(
  track: TrackMeta,
  providers: AudioFeatureProvider[],
  results: (Partial<MusicalFeatures> | null)[],
): ResolvedFeatures {
  const values: Partial<MusicalFeatures> = {};
  const provenance = {} as Record<FeatureField, string>;

  results.forEach((partial, i) => {
    if (!partial) return;
    for (const field of FEATURE_FIELDS) {
      if (provenance[field] || !isValid(field, partial[field])) continue;
      (values as Record<string, unknown>)[field] = partial[field];
      provenance[field] = providers[i].label;
    }
  });

  const derived = deriveFeatures(track);
  for (const field of FEATURE_FIELDS) {
    if (provenance[field]) continue;
    (values as Record<string, unknown>)[field] = derived[field];
    provenance[field] = derivedProvider.label;
  }

  const v = values as MusicalFeatures;
  const tempo = clamp(v.tempo, 40, 220);
  const timeSignature = Math.round(clamp(v.timeSignature, 2, 9));
  // Re-derive fallback sections on the resolved tempo so phrases line up with real beats.
  const sections =
    provenance.sections === derivedProvider.label
      ? deriveSections(track.durationMs / 1000, tempo, timeSignature, v.loudness, mulberry32(hashString(`${track.id}|sections`)))
      : v.sections;
  return { ...v, tempo, timeSignature, sections, key: Math.round(v.key), provenance };
}
