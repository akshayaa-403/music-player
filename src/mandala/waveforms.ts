/** Periodic wave shapes w(x), 2π-periodic and normalized to [-1, 1]. */
export type Waveform = 'sine' | 'triangle' | 'pulse' | 'soft-square' | 'saw' | 'overtones' | 'overtones-alt';

const raw: Record<Waveform, (x: number) => number> = {
  sine: Math.sin,
  triangle: (x) => (2 / Math.PI) * Math.asin(Math.sin(x)),
  // Sharp beat-like peaks with flat valleys.
  pulse: (x) => Math.pow((1 + Math.sin(x)) / 2, 3) * 2 - 1,
  'soft-square': (x) => Math.tanh(3 * Math.sin(x)),
  // Band-limited sawtooth (first 4 Fourier partials) — smooth enough to draw crisply.
  saw: (x) => Math.sin(x) - Math.sin(2 * x) / 2 + Math.sin(3 * x) / 3 - Math.sin(4 * x) / 4,
  // Harmonic series: fundamental + 2nd + 3rd partials (major-key shape).
  overtones: (x) => Math.sin(x) + 0.5 * Math.sin(2 * x) + 0.33 * Math.sin(3 * x),
  // Alternating-sign partials: a darker, more angular shape (minor-key shape).
  'overtones-alt': (x) => Math.sin(x) - 0.5 * Math.sin(2 * x) + 0.33 * Math.sin(3 * x),
};

export const WAVEFORM_LABEL: Record<Waveform, string> = {
  sine: 'sin(x)',
  triangle: '(2/π)·asin(sin x)',
  pulse: '2·((1+sin x)/2)³ − 1',
  'soft-square': 'tanh(3·sin x)',
  saw: 'Σₙ₌₁⁴ (−1)ⁿ⁺¹ sin(nx)/n',
  overtones: 'sin x + ½ sin 2x + ⅓ sin 3x',
  'overtones-alt': 'sin x − ½ sin 2x + ⅓ sin 3x',
};

// Normalize each shape by its true peak so amplitude bounds are exact.
const peak = {} as Record<Waveform, number>;
for (const name of Object.keys(raw) as Waveform[]) {
  let m = 0;
  for (let i = 0; i < 4096; i++) m = Math.max(m, Math.abs(raw[name]((i / 4096) * 2 * Math.PI)));
  peak[name] = m || 1;
}

export function wave(name: Waveform, x: number): number {
  // Clamp guards against the sampled peak sitting a hair below the true one.
  return Math.max(-1, Math.min(1, raw[name](x) / peak[name]));
}
