import type { TrackMeta } from '../spotify/api';

export interface Section {
  start: number; // seconds
  duration: number; // seconds
  loudness: number; // dB (negative)
}

export interface MusicalFeatures {
  tempo: number; // BPM
  key: number; // pitch class 0..11 (C = 0)
  mode: 0 | 1; // 0 minor, 1 major
  timeSignature: number; // beats per bar
  energy: number; // 0..1
  loudness: number; // dB
  danceability: number; // 0..1
  valence: number; // 0..1
  acousticness: number; // 0..1
  instrumentalness: number; // 0..1
  sections: Section[];
}

export type FeatureField = keyof MusicalFeatures;

export const FEATURE_FIELDS: FeatureField[] = [
  'tempo',
  'key',
  'mode',
  'timeSignature',
  'energy',
  'loudness',
  'danceability',
  'valence',
  'acousticness',
  'instrumentalness',
  'sections',
];

export interface ResolvedFeatures extends MusicalFeatures {
  /** Which provider supplied each field (provider label). */
  provenance: Record<FeatureField, string>;
}

export interface ProviderContext {
  signal?: AbortSignal;
}

/**
 * Pluggable source of musical attributes. Providers may return any subset of
 * fields (or null); the resolver fills gaps from the next provider and finally
 * from the deterministic metadata-derived fallback.
 */
export interface AudioFeatureProvider {
  readonly label: string;
  getFeatures(track: TrackMeta, ctx: ProviderContext): Promise<Partial<MusicalFeatures> | null>;
}
