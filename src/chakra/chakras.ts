import type { Waveform } from '../mandala/waveforms';

export interface Chakra {
  id: string;
  name: string;
  sanskrit: string;
  /** Note name and pitch class (C = 0) this chakra is linked to. */
  note: string;
  pc: number;
  /** Solfeggio frequency this chakra is linked to. */
  hz: number;
  mantra: string | null;
  sounds: string;
  /** Traditional chakra colour (hue, degrees). */
  hue: number;
  /** Traditional lotus petal count. */
  petals: number;
  /** Wave lobes drawn (= petals, except Crown's 1000 which can't be drawn legibly). */
  k: number;
  waveform: Waveform;
}

/**
 * Root (innermost) to Crown (outermost). Notes, frequencies and sounds follow
 * the user's brief; Vam/Ram/Yam seed mantras come from common bija-mantra
 * listings. These are traditional associations, not scientific findings.
 */
export const CHAKRAS: Chakra[] = [
  {
    id: 'root',
    name: 'Root',
    sanskrit: 'Muladhara',
    note: 'C',
    pc: 0,
    hz: 396,
    mantra: 'Lam',
    sounds: 'Deep, grounding sounds like drums',
    hue: 0,
    petals: 4,
    k: 4,
    waveform: 'pulse',
  },
  {
    id: 'sacral',
    name: 'Sacral',
    sanskrit: 'Svadhisthana',
    note: 'D',
    pc: 2,
    hz: 417,
    mantra: 'Vam',
    sounds: 'Flowing sounds, wind instruments like trumpets',
    hue: 26,
    petals: 6,
    k: 6,
    waveform: 'sine',
  },
  {
    id: 'solar',
    name: 'Solar Plexus',
    sanskrit: 'Manipura',
    note: 'E',
    pc: 4,
    hz: 528,
    mantra: 'Ram',
    sounds: 'Bright, metallic or resonating tones',
    hue: 50,
    petals: 10,
    k: 10,
    waveform: 'saw',
  },
  {
    id: 'heart',
    name: 'Heart',
    sanskrit: 'Anahata',
    note: 'F',
    pc: 5,
    hz: 639,
    mantra: 'Yam',
    sounds: 'Melodic strings (guitar, violin, harp) or singing bowls',
    hue: 125,
    petals: 12,
    k: 12,
    waveform: 'overtones',
  },
  {
    id: 'throat',
    name: 'Throat',
    sanskrit: 'Vishuddha',
    note: 'G',
    pc: 7,
    hz: 741,
    mantra: 'Ham',
    sounds: 'Chanting, singing or humming; flutes and wind instruments',
    hue: 198,
    petals: 16,
    k: 16,
    waveform: 'triangle',
  },
  {
    id: 'third-eye',
    name: 'Third Eye',
    sanskrit: 'Ajna',
    note: 'A',
    pc: 9,
    hz: 852,
    mantra: 'Om',
    sounds: 'Bells or gentle singing bowls',
    hue: 245,
    petals: 2,
    k: 2,
    waveform: 'overtones-alt',
  },
  {
    id: 'crown',
    name: 'Crown',
    sanskrit: 'Sahasrara',
    note: 'B',
    pc: 11,
    hz: 963,
    mantra: 'Soft Om, or stillness',
    sounds: 'Stillness, conch (shankha) or fading chimes',
    hue: 282,
    petals: 1000,
    k: 24,
    waveform: 'sine',
  },
];

const NATURAL_TO_CHAKRA: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };

/**
 * Which chakra(s) a pitch class feeds. Natural notes map 1:1 (C→Root … B→Crown).
 * Sharps/flats have no chakra of their own, so they split evenly between the
 * two neighbouring naturals (C♯ → half Root, half Sacral).
 */
export function pitchClassToChakras(pc: number): [chakra: number, weight: number][] {
  const p = ((pc % 12) + 12) % 12;
  if (p in NATURAL_TO_CHAKRA) return [[NATURAL_TO_CHAKRA[p], 1]];
  return [
    [NATURAL_TO_CHAKRA[p - 1], 0.5],
    [NATURAL_TO_CHAKRA[p + 1], 0.5],
  ];
}

/** Weights of the three signals combined into a chakra's strength. */
export const SIGNAL_WEIGHTS = { note: 0.5, freq: 0.25, texture: 0.25 } as const;
