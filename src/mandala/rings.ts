import { clamp, frac } from '../lib/random';
import type { ResolvedFeatures, Section } from '../features/types';
import { CHAKRAS } from '../chakra/chakras';
import { chakraStrengthAt } from '../chakra/strength';
import type { ChakraMap } from '../chakra/types';
import { WAVEFORM_LABEL, type Waveform } from './waveforms';

/**
 * Ring i is the polar curve  r_i(θ,t) = R_i + A_i(t) · w_i(k_i·θ + φ_i(t)),
 * in units of the mandala's outer radius (1.0 = edge).
 */
export interface RingSpec {
  id: string;
  index: number;
  name: string;
  role: string;
  band: string;
  driver: string;
  hue: number;
  R: number;
  k: number;
  ampMin: number;
  ampMax: number;
  waveform: Waveform;
  waveformLabel: string;
  amplitudeExpr: string;
  phaseExpr: string;
  /** Musical inputs that drive this ring, for the inspector. */
  inputs: { label: string; value: string; source?: string }[];
  /** Clamped amplitude A_i(t), t in seconds. */
  amplitude(t: number): number;
  /** Angular phase φ_i(t) in radians. */
  phase(t: number): number;
  /** 0..1 — how present this ring's chakra is at time t (grey at 0, full colour near 1). */
  highlight(t: number): number;
  /** Draw a progress arc and section ticks on this ring. */
  timeline?: boolean;
}

// Radial layout. Rings sit between R_MIN and R_MAX; each may swing at most
// AMP_FRACTION of the gap, so neighbours can kiss but never cross the centre
// line of the next ring, and the outermost stays inside the canvas.
export const RING_COUNT = CHAKRAS.length;
export const R_MIN = 0.15;
export const R_MAX = 0.86;
export const RING_GAP = (R_MAX - R_MIN) / (RING_COUNT - 1);
export const AMP_FRACTION = 0.56;
export const AMP_MAX = RING_GAP * AMP_FRACTION;
export const OUTER_LIMIT = R_MAX + AMP_MAX;

const TAU = Math.PI * 2;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export interface Timing {
  beats: number;
  beatFrac: number;
  bars: number;
  sectionIndex: number;
  sinceSection: number;
  sectionLevel: number; // 0.45..1 relative loudness of current section
  progress: number; // 0..1
}

export function makeTiming(features: ResolvedFeatures, durationSec: number) {
  const { tempo, timeSignature, sections } = features;
  const louds = sections.map((s) => s.loudness);
  const lo = Math.min(...louds);
  const hi = Math.max(...louds);
  const level = (s: Section | undefined) =>
    s ? 0.45 + 0.55 * (hi - lo > 0.01 ? (s.loudness - lo) / (hi - lo) : 1) : 0.8;

  return (t: number): Timing => {
    const beats = (t * tempo) / 60;
    let idx = 0;
    for (let i = 0; i < sections.length; i++) if (sections[i].start <= t) idx = i;
    const sec = sections[idx];
    return {
      beats,
      beatFrac: frac(beats),
      bars: beats / timeSignature,
      sectionIndex: idx,
      sinceSection: sec ? t - sec.start : t,
      sectionLevel: level(sec),
      progress: durationSec > 0 ? clamp(t / durationSec, 0, 1) : 0,
    };
  };
}

/**
 * One ring per chakra, Root (inside) → Crown (outside). Shape comes from the
 * chakra (petal count, sound-type waveform); size, motion and colour timing
 * come from this song's chakra map and tempo.
 */
export function buildRings(f: ResolvedFeatures, chakra: ChakraMap, durationSec: number): RingSpec[] {
  const timing = makeTiming(f, durationSec);
  const amp = (v: number) => clamp(v, AMP_MAX * 0.15, AMP_MAX);

  return CHAKRAS.map((c, i) => {
    const profile = chakra.profile[i];
    const parts = chakra.parts[i];
    const dir = i % 2 === 0 ? 1 : -1;
    const barsPerTurn = 8 + 4 * i; // lower chakras turn faster
    const strength = (t: number) => chakraStrengthAt(chakra, i, t, timing(t));
    const R = R_MIN + i * RING_GAP;
    const petals = c.petals === c.k ? `${c.petals}` : `${c.petals} (drawn as ${c.k})`;

    return {
      id: c.id,
      index: i,
      name: c.name,
      role: `${c.sanskrit}${c.mantra ? ` · “${c.mantra}”` : ''} — ${c.sounds}.`,
      band: `Note ${c.note} · ${c.hz} Hz`,
      driver: `Strength ${pct(profile)}`,
      hue: c.hue,
      R,
      k: c.k,
      ampMin: AMP_MAX * 0.15,
      ampMax: AMP_MAX,
      waveform: c.waveform,
      waveformLabel: WAVEFORM_LABEL[c.waveform],
      amplitudeExpr: `A = Aₘₐₓ·(0.2 + 0.4·strength + 0.4·s(t)),  strength = ${profile.toFixed(2)}`,
      phaseExpr: `φ = ${dir > 0 ? '' : '−'}${c.k}·2π·bars / ${barsPerTurn}   (one turn per ${barsPerTurn} bars at ${f.tempo.toFixed(0)} BPM)`,
      inputs: [
        { label: 'In this song', value: pct(profile) },
        { label: `Note ${c.note}`, value: pct(parts.note) },
        { label: `Frequency ${c.hz} Hz`, value: chakra.source === 'estimate' ? 'needs audio' : pct(parts.freq) },
        { label: 'Sound type', value: pct(parts.texture) },
        { label: 'Petals (lobes k)', value: petals },
      ],
      amplitude: (t) => amp(AMP_MAX * (0.2 + 0.4 * profile + 0.4 * strength(t))),
      phase: (t) => (dir * c.k * TAU * timing(t).bars) / barsPerTurn,
      highlight: strength,
    };
  });
}

/** Section start angles for tick marks (θ measured from 12 o'clock, clockwise). */
export function sectionAngles(f: ResolvedFeatures, durationSec: number): number[] {
  if (durationSec <= 0) return [];
  return f.sections.map((s) => -Math.PI / 2 + (TAU * s.start) / durationSec);
}
