import { FFT } from '../audio/fft';
import { CHAKRAS, SIGNAL_WEIGHTS, pitchClassToChakras } from './chakras';
import type { ChakraMap, ChakraParts } from './types';

export const ANALYSIS_SR = 22050;
const N = 4096; // 5.4 Hz per bin at 22.05 kHz — enough to tell 396 Hz from 417 Hz
const HOP = 1024; // ~46 ms per frame
const C = CHAKRAS.length;

const p95 = (arr: ArrayLike<number>): number => {
  const s = Float64Array.from(arr).sort();
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : 0;
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export interface AnalyzeOptions {
  source: ChakraMap['source'];
  sourceLabel: string;
  /** Keep the per-moment timeline (only meaningful when samples start at song time 0). */
  keepTimeline: boolean;
  onProgress?: (fraction: number) => void;
}

/**
 * Turns mono audio into a chakra map. For every frame, three signals per chakra:
 *  - note:    share of tonal energy on the chakra's note (C…B; sharps split between neighbours)
 *  - freq:    how strongly a peak stands out at its Solfeggio frequency (±1.5%)
 *  - texture: a rough "sound type" score for its associated instruments
 * combined as 0.5·note + 0.25·freq + 0.25·texture.
 */
export async function analyzeSamples(x: Float32Array, sr: number, opts: AnalyzeOptions): Promise<ChakraMap> {
  const binHz = sr / N;
  const bin = (hz: number) => Math.max(1, Math.min(N / 2 - 1, Math.round(hz / binHz)));
  const frames = Math.max(0, Math.floor((x.length - N) / HOP) + 1);

  // Pitch-class lookup for bins in the musical range.
  const pcOfBin = new Int8Array(N / 2).fill(-1);
  for (let k = bin(60); k <= bin(2100); k++) {
    const midi = 12 * Math.log2((k * binHz) / 440) + 69;
    pcOfBin[k] = ((Math.round(midi) % 12) + 12) % 12;
  }
  const hzBins = CHAKRAS.map((c) => [bin(c.hz * 0.985), bin(c.hz * 1.015)] as const);

  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));

  const fft = new FFT(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const mag = new Float64Array(N / 2);
  const prev = new Float64Array(N / 2);

  const noteRaw = new Float32Array(frames * C);
  const freqRaw = new Float32Array(frames * C);
  const texRaw = new Float32Array(frames * C);
  const highRaw = new Float32Array(frames);
  const rms = new Float32Array(frames);

  const band = (lo: number, hi: number) => {
    let s = 0;
    for (let k = bin(lo); k <= bin(hi); k++) s += mag[k] * mag[k];
    return s;
  };
  // 1 − spectral flatness: ~1 for clear pitched tones, ~0 for noise.
  const tonality = (lo: number, hi: number) => {
    let logSum = 0;
    let sum = 0;
    let n = 0;
    for (let k = bin(lo); k <= bin(hi); k++) {
      const p = mag[k] * mag[k] + 1e-12;
      logSum += Math.log(p);
      sum += p;
      n++;
    }
    return n ? 1 - Math.exp(logSum / n) / (sum / n) : 0;
  };

  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    let e = 0;
    for (let i = 0; i < N; i++) {
      const s = x[off + i];
      e += s * s;
      re[i] = s * win[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(e / N);
    fft.transform(re, im);
    for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);

    // Note: chroma folded onto chakras.
    const pc = new Float64Array(12);
    for (let k = 0; k < N / 2; k++) if (pcOfBin[k] >= 0) pc[pcOfBin[k]] += mag[k];
    const ch = new Float64Array(C);
    for (let p = 0; p < 12; p++) for (const [c, w] of pitchClassToChakras(p)) ch[c] += pc[p] * w;
    const chMax = Math.max(...ch) || 1;
    for (let c = 0; c < C; c++) noteRaw[f * C + c] = ch[c] / chMax;

    // Frequency: peak at the Solfeggio frequency vs the average around 300–1100 Hz.
    let ref = 0;
    const r0 = bin(300);
    const r1 = bin(1100);
    for (let k = r0; k <= r1; k++) ref += mag[k];
    ref = ref / (r1 - r0 + 1) + 1e-9;
    for (let c = 0; c < C; c++) {
      let peak = 0;
      for (let k = hzBins[c][0]; k <= hzBins[c][1]; k++) peak = Math.max(peak, mag[k]);
      freqRaw[f * C + c] = clamp01((peak / ref - 1.5) / 4);
    }

    // Texture: rough sound-type cues (see CHAKRAS[].sounds).
    const total = band(20, sr / 2 - binHz) + 1e-12;
    let fluxLow = 0;
    let lowSum = 0;
    let fluxAll = 0;
    let allSum = 0;
    for (let k = 1; k < N / 2; k++) {
      const d = Math.max(0, mag[k] - prev[k]);
      fluxAll += d;
      allSum += mag[k];
      if (k <= bin(150)) {
        fluxLow += d;
        lowSum += mag[k];
      }
      prev[k] = mag[k];
    }
    const percLow = lowSum ? fluxLow / lowSum : 0; // drum-like onsets in the bass
    const percAll = allSum ? fluxAll / allSum : 0;
    const share = (lo: number, hi: number) => band(lo, hi) / total;
    const metallic = share(2000, 5000) * (1 - tonality(2000, 5000) * 0.5);
    const t = f * C;
    texRaw[t + 0] = share(40, 150) * (0.4 + percLow); // drums, gongs, deep sounds
    texRaw[t + 1] = share(150, 1000) * (1 - Math.min(1, percAll * 2)); // smooth, flowing, brass/wind
    texRaw[t + 2] = metallic; // bright, metallic
    texRaw[t + 3] = share(200, 2000) * tonality(200, 2000) + 0.3 * metallic; // strings, bowls (+ metallic overlap)
    texRaw[t + 4] = share(300, 3400) * tonality(300, 3400); // voice, humming, flute
    texRaw[t + 5] = share(2000, 8000) * tonality(2000, 8000); // bells, soft bowls
    highRaw[f] = share(6000, sr / 2 - binHz); // chimes (crown also gets "stillness" below)

    if (f % 200 === 199) {
      opts.onProgress?.(f / frames);
      await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
    }
  }

  // Normalise and combine.
  const loudRef = p95(rms) || 1;
  const texRef = CHAKRAS.map((_, c) => p95(Array.from({ length: frames }, (_, f) => texRaw[f * C + c])) || 1);
  const highRef = p95(highRaw) || 1;
  const strength = new Float32Array(frames * C);
  const sums: ChakraParts[] = CHAKRAS.map(() => ({ note: 0, freq: 0, texture: 0 }));

  for (let f = 0; f < frames; f++) {
    const loud = Math.min(1, rms[f] / loudRef);
    for (let c = 0; c < C; c++) {
      const i = f * C + c;
      const note = noteRaw[i] * loud;
      const freq = freqRaw[i] * loud;
      const texture =
        c === 6
          ? 0.5 * (1 - loud) + 0.5 * clamp01(highRaw[f] / highRef) // stillness or chimes
          : clamp01(texRaw[i] / texRef[c]) * loud;
      strength[i] = SIGNAL_WEIGHTS.note * note + SIGNAL_WEIGHTS.freq * freq + SIGNAL_WEIGHTS.texture * texture;
      sums[c].note += note;
      sums[c].freq += freq;
      sums[c].texture += texture;
    }
  }

  // Light smoothing (~0.2 s) so rings don't flicker frame to frame.
  const smooth = new Float32Array(frames * C);
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < C; c++) {
      let s = 0;
      let n = 0;
      for (let d = -2; d <= 2; d++) {
        const g = f + d;
        if (g >= 0 && g < frames) {
          s += strength[g * C + c];
          n++;
        }
      }
      smooth[f * C + c] = s / n;
    }
  }
  // Scale across ALL chakras together, so a chakra that's barely in the song stays mostly grey.
  const globalRef = p95(smooth) || 1;
  for (let i = 0; i < smooth.length; i++) smooth[i] = clamp01(smooth[i] / globalRef);

  const mean = CHAKRAS.map((_, c) => {
    let s = 0;
    for (let f = 0; f < frames; f++) s += smooth[f * C + c];
    return frames ? s / frames : 0;
  });
  return {
    source: opts.source,
    sourceLabel: opts.sourceLabel,
    profile: stretchProfile(mean),
    parts: sums.map((s) => ({
      note: frames ? s.note / frames : 0,
      freq: frames ? s.freq / frames : 0,
      texture: frames ? s.texture / frames : 0,
    })),
    timeline: opts.keepTimeline ? { hop: HOP / sr, frames, data: smooth } : null,
  };
}

/**
 * Real music spreads energy over many notes, so raw averages come out similar
 * (all ~0.5–1). Stretch them so each song's strongest chakra = 1 and its
 * weakest = 0.15, making every song's mandala visibly its own.
 */
export function stretchProfile(values: number[]): number[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi - lo < 1e-6) return values.map(() => 1);
  return values.map((v) => 0.15 + (0.85 * (v - lo)) / (hi - lo));
}

/** Decodes any browser-supported audio (MP3, M4A/AAC, WAV…) to mono at ANALYSIS_SR. */
export async function decodeToMono(buf: ArrayBuffer): Promise<Float32Array> {
  // decodeAudioData resamples to the context's rate, so a tiny offline context does the work.
  const ctx = new OfflineAudioContext(1, 1, ANALYSIS_SR);
  const audio = await ctx.decodeAudioData(buf);
  const out = new Float32Array(audio.length);
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const data = audio.getChannelData(ch);
    for (let i = 0; i < data.length; i++) out[i] += data[i] / audio.numberOfChannels;
  }
  return out;
}
