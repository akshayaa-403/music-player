import type { ResolvedFeatures } from '../features/types';
import { CHAKRAS, SIGNAL_WEIGHTS, pitchClassToChakras } from './chakras';
import type { ChakraMap } from './types';
import { stretchProfile } from './analyze';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
// How prominent each scale degree tends to be: tonic, fifth and third lead.
const DEGREE_WEIGHT = [1, 0.45, 0.6, 0.45, 0.75, 0.45, 0.4];

/**
 * Fallback when no audio is available: notes come from the song's key and
 * scale; sound types are guessed from Spotify-style traits. The Solfeggio
 * frequency signal can't be estimated without audio, so it's left at 0.
 */
export function estimateChakraMap(f: ResolvedFeatures): ChakraMap {
  const note = new Array(CHAKRAS.length).fill(0);
  (f.mode === 1 ? MAJOR : MINOR).forEach((interval, deg) => {
    for (const [c, w] of pitchClassToChakras(f.key + interval)) note[c] += DEGREE_WEIGHT[deg] * w;
  });
  const noteMax = Math.max(...note) || 1;

  const texture = [
    f.energy * (0.5 + 0.5 * f.danceability), // drums, deep grounding
    (1 - f.energy) * 0.5 + f.valence * 0.5, // flowing
    f.energy * (1 - f.acousticness), // bright, metallic
    f.acousticness * 0.7 + f.valence * 0.3, // melodic strings
    1 - f.instrumentalness, // singing, voice
    f.instrumentalness * 0.6 + f.acousticness * 0.4, // bells, bowls
    1 - f.energy, // stillness
  ];

  const parts = CHAKRAS.map((_, c) => ({ note: note[c] / noteMax, freq: 0, texture: texture[c] }));
  const raw = parts.map((p) => SIGNAL_WEIGHTS.note * p.note + SIGNAL_WEIGHTS.texture * p.texture);
  return {
    source: 'estimate',
    sourceLabel: 'Estimated from the song’s key and traits (no audio available)',
    profile: stretchProfile(raw),
    parts,
    timeline: null,
  };
}
