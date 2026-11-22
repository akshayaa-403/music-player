import { describe, expect, it } from 'vitest';
import { derivedFeatures, mergeFeatures } from '../features/resolve';
import { ringFrame, ringRadius } from '../mandala/geometry';
import { AMP_MAX, OUTER_LIMIT, R_MIN, buildRings } from '../mandala/rings';
import { buildScene } from '../mandala/scene';
import { primsToSvg } from '../mandala/svg';
import { wave, type Waveform } from '../mandala/waveforms';
import { frequencyToHue, hslToHex, pitchClassHue } from '../mandala/color';
import { PlaybackClock } from '../playback/clock';
import { estimateChakraMap } from '../chakra/estimate';
import type { TrackMeta } from '../spotify/api';
import { parseTrackLink } from '../spotify/parseTrackLink';

const ID = '4uLU6hMCjMI75M1A2tKUQC';
const track: TrackMeta = {
  id: ID,
  uri: `spotify:track:${ID}`,
  name: 'Test Song',
  artists: ['Tester'],
  album: 'Album',
  albumArt: null,
  durationMs: 213_000,
  isrc: 'GBARL9300135',
  popularity: 80,
};

describe('parseTrackLink', () => {
  it.each([
    [`https://open.spotify.com/track/${ID}`],
    [`https://open.spotify.com/track/${ID}?si=abc123`],
    [`https://open.spotify.com/intl-de/track/${ID}`],
    [`open.spotify.com/track/${ID}`],
    [`spotify:track:${ID}`],
    [`  ${ID}  `],
  ])('accepts %s', (input) => {
    expect(parseTrackLink(input)).toEqual({ ok: true, id: ID });
  });

  it.each([
    ['', /Paste/],
    [`https://open.spotify.com/album/${ID}`, /album link/],
    [`spotify:playlist:${ID}`, /playlist link/],
    ['https://example.com/track/abc', /open\.spotify\.com/],
    ['https://open.spotify.com/track/short', /malformed/],
    ['https://spotify.link/xyz', /spotify\.link/],
  ])('rejects %s', (input, msg) => {
    const r = parseTrackLink(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
});

describe('features', () => {
  it('derives the same features for the same track', () => {
    expect(derivedFeatures(track)).toEqual(derivedFeatures(track));
  });

  it('derives different features for different tracks', () => {
    const other = derivedFeatures({ ...track, id: '0000000000000000000000' });
    expect(other).not.toEqual(derivedFeatures(track));
  });

  it('derived sections tile the whole song', () => {
    const f = derivedFeatures(track);
    const end = f.sections.at(-1)!;
    expect(f.sections[0].start).toBe(0);
    expect(end.start + end.duration).toBeCloseTo(track.durationMs / 1000, 5);
  });

  it('merges provider values over the fallback and rejects invalid ones', () => {
    const provider = { label: 'Test provider', getFeatures: async () => null };
    const f = mergeFeatures(track, [provider], [{ tempo: 123, key: 42, energy: 0.5 }]);
    expect(f.tempo).toBe(123);
    expect(f.provenance.tempo).toBe('Test provider');
    expect(f.provenance.key).toMatch(/Derived/); // 42 is out of range
    expect(f.energy).toBe(0.5);
  });
});

describe('waveforms', () => {
  const names: Waveform[] = ['sine', 'triangle', 'pulse', 'soft-square', 'saw', 'overtones', 'overtones-alt'];
  it.each(names)('%s stays within [-1, 1] and reaches ±1', (name) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 10000; i++) {
      const v = wave(name, (i / 10000) * Math.PI * 2);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(hi).toBeLessThanOrEqual(1);
    expect(lo).toBeGreaterThanOrEqual(-1);
    expect(Math.max(hi, -lo)).toBeGreaterThan(0.99);
  });
});

describe('rings & radial limits', () => {
  const f = derivedFeatures(track);
  const rings = buildRings(f, estimateChakraMap(f), track.durationMs / 1000);

  it('builds 7 ordered chakra rings', () => {
    expect(rings.map((r) => r.id)).toEqual(['root', 'sacral', 'solar', 'heart', 'throat', 'third-eye', 'crown']);
    for (let i = 1; i < rings.length; i++) expect(rings[i].R).toBeGreaterThan(rings[i - 1].R);
  });

  it('keeps every ring within its radial band at all times', () => {
    for (const r of rings) {
      for (let t = 0; t < track.durationMs / 1000; t += 0.37) {
        const frame = ringFrame(r, t);
        expect(frame.A).toBeGreaterThanOrEqual(r.ampMin - 1e-9);
        expect(frame.A).toBeLessThanOrEqual(AMP_MAX + 1e-9);
        for (let j = 0; j < 64; j++) {
          const rad = ringRadius(frame, (j / 64) * Math.PI * 2);
          expect(rad).toBeGreaterThanOrEqual(R_MIN - AMP_MAX - 1e-9);
          expect(rad).toBeLessThanOrEqual(OUTER_LIMIT + 1e-9);
          expect(Math.abs(rad - r.R)).toBeLessThanOrEqual(AMP_MAX + 1e-9);
        }
      }
    }
  });

  it('is deterministic for a given time', () => {
    const a = buildRings(f, estimateChakraMap(f), 213).map((r) => [r.amplitude(42.5), r.phase(42.5)]);
    const b = buildRings(f, estimateChakraMap(f), 213).map((r) => [r.amplitude(42.5), r.phase(42.5)]);
    expect(a).toEqual(b);
  });
});

describe('colour mapping', () => {
  it('maps low frequencies warm and high frequencies cool', () => {
    expect(frequencyToHue(40)).toBeLessThan(30);
    expect(frequencyToHue(1000)).toBeGreaterThan(100);
    expect(frequencyToHue(1000)).toBeLessThan(170);
    expect(frequencyToHue(12000)).toBeGreaterThan(250);
  });
  it('places fifths next to each other on the hue wheel', () => {
    expect(pitchClassHue(0)).toBe(0); // C
    expect(pitchClassHue(7)).toBe(30); // G
    expect(pitchClassHue(2)).toBe(60); // D
  });
  it('converts hsl to hex', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
  });
});

describe('SVG export', () => {
  it('produces a standalone SVG with one closed path per ring layer', () => {
    const f = derivedFeatures(track);
    const rings = buildRings(f, estimateChakraMap(f), 213);
    const scene = buildScene(rings, {
      width: 1024,
      height: 1024,
      t: 30,
      durationSec: 213,
      sectionAngles: [],
      keyPitchClass: f.key,
      focusId: null,
      samples: 360,
    });
    const svg = primsToSvg(scene.prims, 1024, 1024, { background: '#000', title: 'A & B <test>', description: 'd' });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('A &amp; B &lt;test&gt;');
    expect(svg).not.toMatch(/hsla?\(/); // colours are hex for editor compatibility
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThanOrEqual(rings.length * 4);
  });
});

describe('PlaybackClock', () => {
  it('holds position while paused and snaps on large drift', () => {
    const c = new PlaybackClock();
    c.durationMs = 100_000;
    c.set(5000, false);
    expect(c.nowMs()).toBe(5000);
    c.sync(20_000, true);
    expect(c.nowMs()).toBeGreaterThanOrEqual(20_000);
    expect(c.nowMs()).toBeLessThan(20_100);
  });

  it('corrects small drift smoothly instead of jumping', () => {
    const c = new PlaybackClock();
    c.durationMs = 100_000;
    c.set(10_000, true);
    const before = c.nowMs();
    c.sync(before + 100, true); // 100ms ahead: under snap threshold
    const after = c.nowMs();
    expect(after - before).toBeLessThan(20); // no instant jump
    const at = performance.now() + 1000;
    expect(c.nowMs(at) - after).toBeGreaterThan(1080); // caught up within ~1s
  });
});
