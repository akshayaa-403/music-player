export type ParseResult = { ok: true; id: string } | { ok: false; error: string };

const ID_RE = /^[A-Za-z0-9]{22}$/;
const OTHER_KINDS = ['album', 'playlist', 'artist', 'episode', 'show', 'user'];

/**
 * Accepts:
 *   https://open.spotify.com/track/<id>[?si=...]
 *   https://open.spotify.com/intl-de/track/<id>
 *   spotify:track:<id>
 *   <id> (bare 22-char base62)
 */
export function parseTrackLink(raw: string): ParseResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: 'Paste a Spotify track link to begin.' };

  if (ID_RE.test(input)) return { ok: true, id: input };

  const uri = /^spotify:([a-z]+):([A-Za-z0-9]+)$/i.exec(input);
  if (uri) {
    const [, kind, id] = uri;
    if (kind.toLowerCase() !== 'track') return wrongKind(kind);
    return ID_RE.test(id) ? { ok: true, id } : badId();
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return { ok: false, error: 'That doesn’t look like a Spotify link or URI.' };
  }
  if (url.hostname !== 'open.spotify.com' && url.hostname !== 'play.spotify.com') {
    if (url.hostname === 'spotify.link') {
      return { ok: false, error: 'Short spotify.link URLs can’t be resolved here — open it and copy the full open.spotify.com link.' };
    }
    return { ok: false, error: 'Only open.spotify.com track links are supported.' };
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0]?.startsWith('intl-')) parts.shift();
  if (parts[0]?.toLowerCase() === 'embed') parts.shift();
  const [kind, id] = parts;
  if (!kind || !id) return { ok: false, error: 'The link is missing a track ID.' };
  if (kind.toLowerCase() !== 'track') return wrongKind(kind);
  return ID_RE.test(id) ? { ok: true, id } : badId();
}

function wrongKind(kind: string): ParseResult {
  const k = kind.toLowerCase();
  return {
    ok: false,
    error: OTHER_KINDS.includes(k)
      ? `That’s a Spotify ${k} link — paste a single track link instead.`
      : 'Only Spotify track links are supported.',
  };
}

const badId = (): ParseResult => ({ ok: false, error: 'The track ID in that link looks malformed.' });
