import { spotifyFetch } from '../spotify/api';
import type { AudioFeatureProvider, MusicalFeatures } from './types';

interface SpotifyAudioFeatures {
  tempo: number;
  key: number;
  mode: number;
  time_signature: number;
  energy: number;
  loudness: number;
  danceability: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
}

interface SpotifyAnalysis {
  sections?: { start: number; duration: number; loudness: number }[];
}

/**
 * Spotify's own audio-features / audio-analysis endpoints. Apps created after
 * Nov 2024 get 403 here, so failures are expected and silently ignored.
 */
export const spotifyProvider: AudioFeatureProvider = {
  label: 'Spotify audio features',
  async getFeatures(track) {
    const [features, analysis] = await Promise.all([
      spotifyFetch<SpotifyAudioFeatures>(`/audio-features/${track.id}`).catch(() => null),
      spotifyFetch<SpotifyAnalysis>(`/audio-analysis/${track.id}`).catch(() => null),
    ]);
    if (!features && !analysis) return null;
    const out: Partial<MusicalFeatures> = {};
    if (features) {
      Object.assign(out, {
        tempo: features.tempo,
        key: features.key,
        mode: features.mode === 0 ? 0 : 1,
        timeSignature: features.time_signature,
        energy: features.energy,
        loudness: features.loudness,
        danceability: features.danceability,
        valence: features.valence,
        acousticness: features.acousticness,
        instrumentalness: features.instrumentalness,
      });
    }
    if (analysis?.sections?.length) {
      out.sections = analysis.sections.map((s) => ({ start: s.start, duration: s.duration, loudness: s.loudness }));
    }
    return out;
  },
};
