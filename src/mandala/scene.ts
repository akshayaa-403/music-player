import { pitchClassToChakras } from '../chakra/chakras';
import { hsl } from './color';
import { ringFrame, sampleRing, THETA0, type RingFrame } from './geometry';
import { OUTER_LIMIT, type RingSpec } from './rings';

/**
 * Renderer-agnostic description of one mandala frame: a list of stroked
 * polylines, circles and dots in screen space. Both the canvas renderer and
 * the SVG serializer consume this, so exports match the screen exactly.
 */
export type Prim =
  | { type: 'path'; pts: Float64Array; closed: boolean; color: string; width: number; alpha: number; additive: boolean; dash?: number[] }
  | { type: 'circle'; cx: number; cy: number; r: number; color: string; width: number; alpha: number; dash?: number[] }
  | { type: 'dot'; cx: number; cy: number; r: number; color: string; alpha: number; additive: boolean }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; alpha: number };

export interface SceneOptions {
  width: number;
  height: number;
  t: number; // seconds
  durationSec: number;
  sectionAngles: number[]; // radians, absolute (already include THETA0)
  keyPitchClass: number;
  focusId: string | null; // hovered or selected ring
  samples: number;
  inset?: Insets;
}

export interface Scene {
  cx: number;
  cy: number;
  scale: number;
  frames: RingFrame[];
  prims: Prim[];
}

/** Space reserved by overlaid UI (header / transport) that the mandala should avoid. */
export interface Insets {
  top: number;
  bottom: number;
}

export function sceneGeometry(width: number, height: number, inset: Insets = { top: 0, bottom: 0 }) {
  const availH = Math.max(1, height - inset.top - inset.bottom);
  // Fit the outermost swing plus the section tick marks inside 96% of the half-extent.
  return {
    cx: width / 2,
    cy: inset.top + availH / 2,
    scale: ((Math.min(width, availH) / 2) * 0.96) / (OUTER_LIMIT + 0.04),
  };
}

export function buildScene(rings: RingSpec[], o: SceneOptions): Scene {
  const { cx, cy, scale } = sceneGeometry(o.width, o.height, o.inset);
  const frames = rings.map((r) => ringFrame(r, o.t));
  const prims: Prim[] = [];
  const unit = scale / 420; // stroke widths scale with the mandala
  const progress = o.durationSec > 0 ? Math.min(1, o.t / o.durationSec) : 0;

  // Guides: 12 pitch-class spokes (the song's key highlighted in its chakra's colour) and base circles.
  const keyRing = pitchClassToChakras(o.keyPitchClass)[0][0];
  for (let pc = 0; pc < 12; pc++) {
    const a = THETA0 + (pc / 12) * Math.PI * 2;
    const isKey = pc === o.keyPitchClass;
    const r0 = rings[0].R * scale * 0.55;
    const r1 = (rings[rings.length - 1].R + 0.07) * scale;
    prims.push({
      type: 'line',
      x1: cx + r0 * Math.cos(a),
      y1: cy + r0 * Math.sin(a),
      x2: cx + r1 * Math.cos(a),
      y2: cy + r1 * Math.sin(a),
      color: isKey ? hsl(rings[keyRing]?.hue ?? 0, 90, 70) : 'hsl(230, 30%, 60%)',
      width: (isKey ? 1.2 : 0.6) * unit,
      alpha: isKey ? 0.35 : 0.08,
    });
  }
  for (const r of rings) {
    prims.push({ type: 'circle', cx, cy, r: r.R * scale, color: 'hsl(230, 30%, 70%)', width: 0.6 * unit, alpha: 0.09, dash: [2 * unit, 6 * unit] });
  }

  for (const f of frames) {
    const { spec, highlight: h } = f;
    const dim = o.focusId && o.focusId !== spec.id ? 0.3 : 1;
    const focused = o.focusId === spec.id;
    const hue = spec.hue;
    // Rings rest in grey and only take on their colour while their part of the
    // music is happening (beat, phrase start, section change…), then fade back.
    const act = colourAmount(h);
    const sat = (s: number) => s * act;
    const light = 52 + 6 * act + 14 * h;
    const color = hsl(hue, sat(96), light);
    const w = (1.5 + 1.6 * h + (focused ? 1.4 : 0)) * unit;
    const pts = sampleRing(f, o.samples, cx, cy, scale);

    // Interference ghost: same wave, half a cycle out of phase.
    const ghost = sampleRing(f, o.samples, cx, cy, scale, Math.PI);
    prims.push({ type: 'path', pts: ghost, closed: true, color: hsl(hue, sat(80), 60), width: 0.8 * unit, alpha: 0.22 * dim, additive: true });

    // Glow is drawn as stacked wide, faint strokes — cheap, and reproducible in SVG.
    prims.push({ type: 'path', pts, closed: true, color, width: w * 7, alpha: (0.05 + 0.06 * h) * dim, additive: true });
    prims.push({ type: 'path', pts, closed: true, color, width: w * 3, alpha: (0.14 + 0.12 * h) * dim, additive: true });

    if (spec.timeline) {
      // Base ring dim; the played portion bright, like a progress dial.
      prims.push({ type: 'path', pts, closed: true, color, width: w, alpha: 0.45 * dim, additive: true });
      const n = Math.floor(progress * o.samples);
      if (n > 1) {
        const played = pts.slice(0, Math.min(pts.length, (n + 1) * 2));
        prims.push({ type: 'path', pts: played, closed: false, color: hsl(hue, sat(100), 80), width: w * 1.6, alpha: dim, additive: true });
      }
      const tickR = (spec.R + spec.ampMax + 0.025) * scale;
      for (const a of o.sectionAngles) {
        prims.push({ type: 'dot', cx: cx + tickR * Math.cos(a), cy: cy + tickR * Math.sin(a), r: 2.2 * unit, color: hsl(hue, sat(90), 75), alpha: 0.8 * dim, additive: true });
      }
      const headA = THETA0 + progress * Math.PI * 2;
      prims.push({ type: 'dot', cx: cx + tickR * Math.cos(headA), cy: cy + tickR * Math.sin(headA), r: 3.6 * unit, color: '#ffffff', alpha: 0.9 * dim, additive: true });
    } else {
      prims.push({ type: 'path', pts, closed: true, color, width: w, alpha: 0.95 * dim, additive: true });
    }
  }

  // Nucleus beats with the pulse ring.
  const pulse = frames[0];
  const nr = (0.035 + 0.03 * pulse.highlight) * scale;
  const nucleusSat = 95 * colourAmount(pulse.highlight);
  prims.push({ type: 'dot', cx, cy, r: nr * 2.2, color: hsl(pulse.spec.hue, nucleusSat, 60), alpha: 0.12, additive: true });
  prims.push({ type: 'dot', cx, cy, r: nr, color: hsl(pulse.spec.hue, nucleusSat, 70), alpha: 0.55 + 0.4 * pulse.highlight, additive: true });

  return { cx, cy, scale, frames, prims };
}

/**
 * How much colour a ring shows (0 = grey, 1 = full colour) for a given
 * highlight. Below 0.08 it's fully grey; it fades in smoothly up to 0.6.
 */
export function colourAmount(highlight: number): number {
  const x = Math.min(1, Math.max(0, (highlight - 0.08) / (0.6 - 0.08)));
  return x * x * (3 - 2 * x);
}
