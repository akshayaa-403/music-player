import { clamp } from '../lib/random';

export const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

const F_LO = 20;
const F_HI = 16000;

/**
 * Frequency → hue on a log scale: bass is warm (red/amber), mids green/teal,
 * treble blue → violet. The 1.4 exponent spends more of the warm end on the
 * low octaves, where most musical energy lives.
 */
export function frequencyToHue(hz: number): number {
  const t = clamp(Math.log(hz / F_LO) / Math.log(F_HI / F_LO), 0, 1);
  return 285 * Math.pow(t, 1.4);
}

/**
 * Pitch class → hue around the circle of fifths (Scriabin-style
 * chromesthesia): harmonically close keys get neighbouring colours. C = red.
 */
export function pitchClassHue(pc: number): number {
  return (((pc * 7) % 12) * 30) % 360;
}

/** Equal-tempered frequency of a pitch class in a given octave (A4 = 440 Hz). */
export function pitchFrequency(pc: number, octave: number): number {
  return 440 * Math.pow(2, (pc - 9) / 12 + (octave - 4));
}

export const hsl = (h: number, s: number, l: number, a = 1) =>
  `hsla(${h.toFixed(1)}, ${s.toFixed(0)}%, ${l.toFixed(1)}%, ${a.toFixed(3)})`;

/** sRGB hex (for SVG attributes and swatches that don't take hsla well). */
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) =>
    Math.round(clamp(x, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}
