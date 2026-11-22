import { describe, expect, it } from 'vitest';
import { ANALYSIS_SR, analyzeSamples } from '../chakra/analyze';
import { CHAKRAS, pitchClassToChakras } from '../chakra/chakras';
import { estimateChakraMap } from '../chakra/estimate';
import { derivedFeatures } from '../features/resolve';

/** A few seconds of a pure tone (plus optional second tone). */
function tone(hzs: number[], seconds = 3): Float32Array {
  const x = new Float32Array(ANALYSIS_SR * seconds);
  for (let i = 0; i < x.length; i++) {
    for (const hz of hzs) x[i] += (0.4 / hzs.length) * Math.sin((2 * Math.PI * hz * i) / ANALYSIS_SR);
  }
  return x;
}

const strongest = (profile: number[]) => CHAKRAS[profile.indexOf(Math.max(...profile))].id;
const opts = { source: 'file' as const, sourceLabel: 'test', keepTimeline: true };

describe('chakra mapping', () => {
  it('maps natural notes one-to-one and splits sharps between neighbours', () => {
    expect(pitchClassToChakras(0)).toEqual([[0, 1]]); // C → Root
    expect(pitchClassToChakras(11)).toEqual([[6, 1]]); // B → Crown
    expect(pitchClassToChakras(1)).toEqual([
      [0, 0.5],
      [1, 0.5],
    ]); // C♯ → half Root, half Sacral
  });

  it.each([
    [261.63, 'root'], // C4
    [293.66, 'sacral'], // D4
    [329.63, 'solar'], // E4
    [349.23, 'heart'], // F4
    [392.0, 'throat'], // G4
    [440.0, 'third-eye'], // A4
  ])('hears a %f Hz tone as %s', async (hz, id) => {
    const map = await analyzeSamples(tone([hz]), ANALYSIS_SR, opts);
    expect(strongest(map.profile)).toBe(id);
  });

  it('detects energy at a Solfeggio frequency', async () => {
    const at = await analyzeSamples(tone([528]), ANALYSIS_SR, opts);
    const off = await analyzeSamples(tone([600]), ANALYSIS_SR, opts);
    expect(at.parts[2].freq).toBeGreaterThan(0.3); // Solar Plexus, 528 Hz
    expect(off.parts[2].freq).toBeLessThan(0.05);
  });

  it('keeps a synced timeline only when asked', async () => {
    const withTl = await analyzeSamples(tone([440], 2), ANALYSIS_SR, opts);
    const without = await analyzeSamples(tone([440], 2), ANALYSIS_SR, { ...opts, keepTimeline: false });
    expect(withTl.timeline?.frames).toBeGreaterThan(30);
    expect(without.timeline).toBeNull();
  });

  it('estimates a map without audio, led by the song key', () => {
    const f = { ...derivedFeatures({ id: 'x'.repeat(22), uri: '', name: 'n', artists: ['a'], album: '', albumArt: null, durationMs: 200_000, isrc: null, popularity: 50 }), key: 9, mode: 1 as const };
    const map = estimateChakraMap(f);
    expect(map.profile).toHaveLength(7);
    expect(Math.max(...map.profile)).toBe(1);
    expect(map.parts[5].note).toBe(1); // A major → Third Eye (A) is the tonic
    expect(map.parts.every((p) => p.freq === 0)).toBe(true);
  });
});
