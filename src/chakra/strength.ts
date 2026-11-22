import { clamp, frac } from '../lib/random';
import type { Timing } from '../mandala/rings';
import type { ChakraMap } from './types';

/**
 * How present chakra `c` is at song time t (0..1).
 * - With a full-song timeline: read straight from the analysis (interpolated).
 * - Otherwise: the song's overall strength for that chakra, pulsed by a rhythm
 *   that suits its sound (drums on beats, bells at phrase starts…). This timing
 *   is an artistic guess; only the overall amount is measured.
 */
export function chakraStrengthAt(map: ChakraMap, c: number, t: number, tm: Timing): number {
  const tl = map.timeline;
  if (tl) {
    const pos = t / tl.hop;
    const i = Math.floor(pos);
    if (i < 0 || i >= tl.frames) return 0;
    const a = tl.data[i * 7 + c];
    const b = i + 1 < tl.frames ? tl.data[(i + 1) * 7 + c] : a;
    return a + (b - a) * (pos - i);
  }

  const p = map.profile[c];
  const flash = tm.sectionIndex > 0 ? Math.exp(-tm.sinceSection / 0.9) : 0;
  const wave = (cycles: number, shift = 0) => 0.5 - 0.5 * Math.cos(2 * Math.PI * (cycles + shift));
  const env = [
    Math.exp(-4 * tm.beatFrac), // Root: drum hits on the beat
    wave(tm.bars / 2), // Sacral: slow flowing swell
    Math.exp(-5 * frac(tm.beats + 0.5)), // Solar: bright accents on the off-beat
    wave(tm.bars / 4) * tm.sectionLevel, // Heart: melodic phrases
    wave(tm.bars / 4, 0.5) * tm.sectionLevel, // Throat: vocal lines, answering the melody
    Math.exp(-1.2 * (tm.bars % 8)), // Third Eye: a bell at each 8-bar phrase
    clamp((1 - tm.sectionLevel) / 0.55, 0, 1), // Crown: stillness — lights up in the quietest sections
  ][c];
  return clamp(p * (0.25 + 0.75 * env) + 0.5 * p * flash, 0, 1);
}
