import type { ResolvedFeatures } from '../features/types';
import type { TrackMeta } from '../spotify/api';
import { ANALYSIS_SR, analyzeSamples, decodeToMono } from './analyze';
import { estimateChakraMap } from './estimate';
import { findPreview } from './preview';
import type { ChakraMap } from './types';

const TIMEOUT_MS = 15_000;

/**
 * Builds a song's chakra map before the mandala is drawn:
 * official 30-second preview (Apple) → analysis; otherwise an estimate.
 */
export async function buildChakraMap(
  track: TrackMeta,
  features: ResolvedFeatures,
  onStatus?: (msg: string) => void,
): Promise<ChakraMap> {
  if (import.meta.env.VITE_DISABLE_PREVIEW_ANALYSIS === 'true') return estimateChakraMap(features);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    onStatus?.('Finding a preview…');
    const url = await findPreview(track, ctrl.signal);
    if (!url) return estimateChakraMap(features);
    onStatus?.('Listening…');
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return estimateChakraMap(features);
    const samples = await decodeToMono(await res.arrayBuffer());
    return await analyzeSamples(samples, ANALYSIS_SR, {
      source: 'preview',
      sourceLabel: 'Listened to the official 30-second preview (Apple Music)',
      keepTimeline: false, // we don't know where in the song the preview starts
    });
  } catch {
    return estimateChakraMap(features);
  } finally {
    clearTimeout(timer);
  }
}

/** Full-song analysis of the user's own audio file. It never leaves the browser. */
export async function analyzeOwnFile(file: File, onProgress?: (f: number) => void): Promise<ChakraMap> {
  const samples = await decodeToMono(await file.arrayBuffer());
  return analyzeSamples(samples, ANALYSIS_SR, {
    source: 'file',
    sourceLabel: `Listened to your file “${file.name}” (whole song, synced)`,
    keepTimeline: true,
    onProgress,
  });
}

export { estimateChakraMap };
export type { ChakraMap };
