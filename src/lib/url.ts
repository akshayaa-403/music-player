/**
 * Shareable app state in the query string:
 *   ?track=<spotify id>   open a Spotify track (after login if needed)
 *   ?demo                 open the silent demo
 *   &view=waves           start in the Waves view (mandala is the default)
 *   &t=<seconds>          start position
 *   &select=<ring id>     open a ring's inspector
 */
import { CHAKRAS } from '../chakra/chakras';

export type ViewMode = 'mandala' | 'waves';
const RING_IDS = new Set(CHAKRAS.map((c) => c.id));

export interface UrlState {
  view: ViewMode | null;
  trackId: string | null;
  demo: boolean;
  t: number | null;
  select: string | null;
}

const TRACK_ID_RE = /^[A-Za-z0-9]{22}$/;
const VIEW_KEY = 'hm.view';

export function readUrlState(search: string = window.location.search): UrlState {
  const q = new URLSearchParams(search);
  const view = q.get('view');
  const track = q.get('track');
  const t = Number(q.get('t'));
  return {
    view: view === 'waves' || view === 'mandala' ? view : null,
    trackId: track && TRACK_ID_RE.test(track) ? track : null,
    demo: q.has('demo'),
    t: Number.isFinite(t) && t > 0 ? t : null,
    select: RING_IDS.has(q.get('select') ?? '') ? q.get('select') : null,
  };
}

/** Builds a query string ("" or "?…"). The default view is left out to keep links short. */
export function buildSearch(s: {
  view?: ViewMode;
  trackId?: string | null;
  demo?: boolean;
  t?: number | null;
  select?: string | null;
  /** Always write the view, even the default (shared links must not defer to the recipient's preference). */
  explicitView?: boolean;
}): string {
  const q = new URLSearchParams();
  if (s.trackId) q.set('track', s.trackId);
  else if (s.demo) q.set('demo', '');
  if (s.view === 'waves' || (s.explicitView && s.view)) q.set('view', s.view);
  if (s.t && s.t > 0) q.set('t', String(Math.floor(s.t)));
  if (s.select) q.set('select', s.select);
  // `demo=` → `demo` for a tidier URL.
  const str = q.toString().replace(/(^|&)demo=(&|$)/, '$1demo$2');
  return str ? `?${str}` : '';
}

/** Absolute link to the app with the given state (works under a GitHub Pages sub-path). */
export function shareUrl(s: Parameters<typeof buildSearch>[0]): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}${buildSearch({ ...s, explicitView: true })}`;
}

/** Replace the address bar's query without adding a history entry. */
export function replaceSearch(search: string): void {
  const next = `${import.meta.env.BASE_URL}${search}${window.location.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, '', next);
  }
}

export function storedView(): ViewMode | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'waves' || v === 'mandala' ? v : null;
  } catch {
    return null;
  }
}

export function storeView(view: ViewMode): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* private mode etc. — the preference just won't persist */
  }
}
