import { describe, expect, it } from 'vitest';
import { estimateChakraMap } from '../chakra/estimate';
import { derivedFeatures } from '../features/resolve';
import { buildSearch, readUrlState } from '../lib/url';
import { ringFrame, ringRadius } from '../mandala/geometry';
import { AMP_MAX, buildRings } from '../mandala/rings';
import { primsToSvg } from '../mandala/svg';
import { buildWavesScene, LANE_FILL, waveEquation, waveValue, wavesHitTest, wavesLayout } from '../mandala/waves';
import type { TrackMeta } from '../spotify/api';

const ID = '4uLU6hMCjMI75M1A2tKUQC';
const track: TrackMeta = {
  id: ID,
  uri: `spotify:track:${ID}`,
  name: 'Test <Song> & "Co"',
  artists: ['Tester'],
  album: 'Album',
  albumArt: null,
  durationMs: 213_000,
  isrc: 'GBARL9300135',
  popularity: 80,
};
const features = derivedFeatures(track);
const rings = buildRings(features, estimateChakraMap(features), track.durationMs / 1000);
const ids = rings.map((r) => r.id);

describe('waves layout', () => {
  it.each([
    [1440, 900],
    [390, 844],
    [768, 1024],
    [2560, 1440],
  ])('stacks seven non-overlapping lanes, Crown on top, at %ix%i', (w, h) => {
    const L = wavesLayout(w, h, ids, { top: 80, bottom: 100, left: 0, right: 0 });
    expect(L.lanes).toHaveLength(7);
    const byTop = [...L.lanes].sort((a, b) => a.top - b.top);
    expect(byTop[0].id).toBe('crown');
    expect(byTop[6].id).toBe('root');
    for (let i = 1; i < byTop.length; i++) expect(byTop[i].top).toBeCloseTo(byTop[i - 1].bottom, 6);
    expect(L.left).toBeLessThan(L.right);
    expect(L.top).toBeGreaterThanOrEqual(80);
    expect(L.bottom).toBeLessThanOrEqual(h - 100);
    expect(L.labelMode).toBe(w >= 680 ? 'gutter' : 'inline');
  });

  it('respects side insets (inspector / legend)', () => {
    const L = wavesLayout(1440, 900, ids, { top: 0, bottom: 0, left: 248, right: 404 });
    expect(L.gutterLeft).toBeGreaterThanOrEqual(248);
    expect(L.right).toBeLessThanOrEqual(1440 - 404);
  });
});

describe('waves scene', () => {
  it('keeps every curve inside its own lane across the whole song', () => {
    const L = wavesLayout(1200, 800, ids, { top: 60, bottom: 90, left: 0, right: 0 });
    for (let t = 0; t <= track.durationMs / 1000; t += 3.7) {
      for (let i = 0; i < rings.length; i++) {
        const f = ringFrame(rings[i], t);
        const lane = L.lanes[i];
        for (let j = 0; j <= 64; j++) {
          const y = lane.mid - waveValue(f, (j / 64) * Math.PI * 2) * L.yScale;
          expect(y).toBeGreaterThanOrEqual(lane.top);
          expect(y).toBeLessThanOrEqual(lane.bottom);
        }
      }
    }
    // The largest possible swing uses LANE_FILL of half a lane.
    expect(AMP_MAX * L.yScale).toBeCloseTo((L.laneH / 2) * LANE_FILL, 6);
  });

  it('is the mandala ring minus its base radius (same function, unrolled)', () => {
    for (const ring of rings) {
      const f = ringFrame(ring, 42);
      // y(θ) = r(θ) − R for every angle, including with the ghost's phase offset.
      for (const x of [0, 0.4, 1.7, 3.1, 5.9]) {
        expect(waveValue(f, x)).toBeCloseTo(ringRadius(f, x) - ring.R, 12);
        expect(waveValue(f, x, Math.PI)).toBeCloseTo(ringRadius(f, x, Math.PI) - ring.R, 12);
      }
    }
  });

  it('hit-tests lanes, including the label gutter', () => {
    const { layout } = buildWavesScene(rings, { width: 1200, height: 800, t: 10, keyPitchClass: 0, focusId: null, inset: { top: 60, bottom: 90 } });
    for (const lane of layout.lanes) {
      expect(wavesHitTest(layout, (layout.left + layout.right) / 2, lane.mid)).toBe(lane.id);
      expect(wavesHitTest(layout, layout.gutterLeft + 4, lane.mid)).toBe(lane.id);
    }
    expect(wavesHitTest(layout, 600, 10)).toBeNull();
    expect(wavesHitTest(layout, 1199, layout.lanes[0].mid)).toBeNull();
  });

  it('exports a standalone SVG with escaped labels', () => {
    const scene = buildWavesScene(rings, { width: 1600, height: 1000, t: 30, keyPitchClass: features.key, focusId: null, labels: true, textScale: 1.4, inset: { top: 30, bottom: 30, left: 30, right: 30 } });
    const svg = primsToSvg(scene.prims, 1600, 1000, { background: '#000', title: track.name, description: 'x' });
    expect(svg).toContain('<title>Test &lt;Song&gt; &amp; &quot;Co&quot;</title>');
    for (const r of rings) expect(svg).toContain(`>${r.name}</text>`);
    expect(svg).toContain('>2π</text>');
    expect(svg).not.toMatch(/NaN|undefined/);
  });

  it('formats the live equation with φ reduced to [0, 2π)', () => {
    expect(waveEquation(0.0341, 24, -0.5)).toBe(`y = 0.034·w(24x + ${(2 * Math.PI - 0.5).toFixed(2)})`);
    expect(waveEquation(0.02, 4, 4 * Math.PI + 1)).toBe('y = 0.020·w(4x + 1.00)');
  });
});

describe('url state', () => {
  it('round-trips track, view, time and selection', () => {
    const s = buildSearch({ trackId: ID, view: 'waves', t: 61.8, select: 'heart' });
    expect(s).toBe(`?track=${ID}&view=waves&t=61&select=heart`);
    expect(readUrlState(s)).toEqual({ view: 'waves', trackId: ID, demo: false, t: 61, select: 'heart' });
  });

  it('keeps demo links tidy and omits the default view', () => {
    expect(buildSearch({ demo: true, view: 'mandala' })).toBe('?demo');
    expect(buildSearch({ demo: true, view: 'waves', t: 12 })).toBe('?demo&view=waves&t=12');
    expect(readUrlState('?demo&t=12').demo).toBe(true);
    expect(buildSearch({})).toBe('');
  });

  it('writes the default view into shared links only when asked', () => {
    expect(buildSearch({ trackId: ID, view: 'mandala' })).toBe(`?track=${ID}`);
    expect(buildSearch({ trackId: ID, view: 'mandala', explicitView: true })).toBe(`?track=${ID}&view=mandala`);
  });

  it('drops unknown ring ids', () => {
    expect(readUrlState('?demo&select=nope').select).toBeNull();
    expect(readUrlState('?demo&select=third-eye').select).toBe('third-eye');
  });

  it('ignores malformed values', () => {
    expect(readUrlState('?track=nope&view=sideways&t=-3')).toEqual({ view: null, trackId: null, demo: false, t: null, select: null });
  });
});
