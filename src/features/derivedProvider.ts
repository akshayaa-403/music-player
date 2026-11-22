import { clamp, hashString, mulberry32 } from '../lib/random';
import type { TrackMeta } from '../spotify/api';
import type { AudioFeatureProvider, MusicalFeatures, Section } from './types';

/**
 * Deterministic fallback: every musical attribute is derived from stable track
 * metadata (ID, ISRC, title, artists, duration, popularity). The same track
 * always yields the same mandala, and no network call is needed.
 */
export function deriveFeatures(track: TrackMeta): MusicalFeatures {
  const seedSource = [track.id, track.isrc ?? '', track.name, track.artists.join(','), track.durationMs].join('|');
  const rnd = mulberry32(hashString(seedSource));
  const range = (lo: number, hi: number) => lo + rnd() * (hi - lo);

  const popularity = track.popularity ?? 50;
  const tempo = Math.round(range(76, 168));
  const key = Math.floor(rnd() * 12);
  const mode: 0 | 1 = rnd() < 0.62 ? 1 : 0;
  const tsRoll = rnd();
  const timeSignature = tsRoll < 0.84 ? 4 : tsRoll < 0.94 ? 3 : tsRoll < 0.98 ? 6 : 5;
  const energy = clamp(range(0.25, 0.92) + (popularity - 50) / 600, 0.05, 0.98);
  const acousticness = clamp((1 - energy) * range(0.4, 1.1), 0.01, 0.95);
  const danceability = clamp(range(0.3, 0.88), 0.05, 0.98);
  const valence = clamp(range(0.1, 0.9) + (mode === 1 ? 0.06 : -0.06), 0.02, 0.98);
  const instrumentalness = clamp(Math.pow(rnd(), 3) * 0.9, 0, 0.95);
  const loudness = -14 + energy * 10 + range(-1, 1);

  return {
    tempo,
    key,
    mode,
    timeSignature,
    energy,
    loudness,
    danceability,
    valence,
    acousticness,
    instrumentalness,
    sections: deriveSections(track.durationMs / 1000, tempo, timeSignature, loudness, rnd),
  };
}

/** Phrase-aligned sections: groups of 8-bar phrases with an intro/outro contour. */
export function deriveSections(
  durationSec: number,
  tempo: number,
  beatsPerBar: number,
  baseLoudness: number,
  rnd: () => number,
): Section[] {
  if (durationSec <= 0) return [];
  const phraseSec = (60 / tempo) * beatsPerBar * 8;
  const sections: Section[] = [];
  let t = 0;
  while (t < durationSec - 0.01) {
    const phrases = sections.length === 0 ? 1 : 2 + Math.floor(rnd() * 3);
    let dur = phrases * phraseSec;
    // Fold a short tail into the last section instead of leaving a sliver.
    if (durationSec - (t + dur) < phraseSec) dur = durationSec - t;
    const isIntro = sections.length === 0;
    const isOutro = t + dur >= durationSec - 0.01 && !isIntro;
    const contour = isIntro ? -5 : isOutro ? -3.5 : (rnd() - 0.4) * 6;
    sections.push({ start: t, duration: dur, loudness: Math.min(-1, baseLoudness + contour) });
    t += dur;
  }
  return sections;
}

export const derivedProvider: AudioFeatureProvider = {
  label: 'Derived from track metadata',
  async getFeatures(track) {
    return deriveFeatures(track);
  },
};
