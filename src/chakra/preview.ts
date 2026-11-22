import type { TrackMeta } from '../spotify/api';

/**
 * Finds the official 30-second preview of a track in Apple's public iTunes
 * Search API (CORS-enabled, no key). Matches on title + artist, and on
 * duration when there are several candidates. Sends only "artist title".
 */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s-\s.*$/, ' ') // " - Remastered 2009"
    .replace(/\bfeat\.?.*$/, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

interface ITunesResult {
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
}

export async function findPreview(track: TrackMeta, signal?: AbortSignal): Promise<string | null> {
  const title = norm(track.name);
  const artist = norm(track.artists[0] ?? '');
  const term = `${artist} ${title}`.trim();
  if (!term) return null;
  const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=15`, {
    signal,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: ITunesResult[] };

  let best: { url: string; score: number } | null = null;
  for (const r of json.results ?? []) {
    if (!r.previewUrl || !r.trackName || !r.artistName) continue;
    const t = norm(r.trackName);
    const a = norm(r.artistName);
    const titleOk = t === title || t.startsWith(title) || title.startsWith(t);
    const artistOk = a.includes(artist) || artist.includes(a);
    if (!titleOk || !artistOk) continue;
    const durDiff = r.trackTimeMillis ? Math.abs(r.trackTimeMillis - track.durationMs) : 10_000;
    const score = (t === title ? 2 : 1) + (durDiff < 3000 ? 2 : durDiff < 10_000 ? 1 : 0);
    if (!best || score > best.score) best = { url: r.previewUrl, score };
  }
  return best?.url ?? null;
}
