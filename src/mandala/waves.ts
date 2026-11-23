import { PITCH_NAMES, hsl } from './color';
import { ringFrame, type RingFrame } from './geometry';
import { AMP_MAX, type RingSpec } from './rings';
import { colourAmount, NO_INSETS, type Insets, type Prim } from './scene';
import { wave } from './waveforms';
import { pitchClassToChakras } from '../chakra/chakras';

/**
 * "Waves" view: the same seven functions as the mandala, unrolled. Each ring's
 * polar curve r(θ,t) = R + A(t)·w(kθ + φ(t)) is drawn as its own horizontal
 * lane, y(x,t) = A(t)·w(k·x + φ(t)) with x = θ ∈ [0, 2π) — the radial
 * displacement from the ring's base circle, plotted against the angle.
 * Lanes run Crown (top) to Root (bottom), like the body, and share one
 * vertical scale so amplitudes are directly comparable.
 */

const TAU = Math.PI * 2;

/** Where the lane labels go: a left gutter on wide screens, above each curve when narrow. */
export type LabelMode = 'gutter' | 'inline';

export interface Lane {
  id: string;
  index: number; // ring index (0 = Root)
  top: number;
  bottom: number;
  mid: number;
}

export interface WavesLayout {
  /** Plot area: x = 0 at `left`, x = 2π at `right`. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Left edge of the label gutter (== left when labels are inline). */
  gutterLeft: number;
  labelMode: LabelMode;
  laneH: number;
  /** Pixels per normalized unit of displacement (shared by all lanes). */
  yScale: number;
  /** Lanes indexed by ring index (lanes[0] is Root, drawn at the bottom). */
  lanes: Lane[];
  /** Baseline of the θ-axis labels. */
  axisY: number;
}

/** Fraction of half a lane the largest possible swing may use. */
export const LANE_FILL = 0.78;

export function wavesLayout(width: number, height: number, ids: string[], inset: Insets = NO_INSETS, textScale = 1): WavesLayout {
  const count = Math.max(1, ids.length);
  const l = inset.left ?? 0;
  const r = inset.right ?? 0;
  const availW = Math.max(1, width - l - r);
  const headerRow = 22 * textScale; // pitch-class labels along the top
  const axisRow = 26 * textScale; // θ tick labels along the bottom
  const top = inset.top + headerRow;
  const bottom = Math.max(top + count, height - inset.bottom - axisRow);
  const laneH = (bottom - top) / count;
  // A gutter label (name, band, meter) needs ~60px of lane; short screens fall back to inline labels.
  const labelMode: LabelMode = availW >= 680 && laneH >= 60 * textScale ? 'gutter' : 'inline';
  const pad = Math.max(12, Math.min(28, availW * 0.025));
  const gutter = labelMode === 'gutter' ? Math.min(204, Math.max(178, availW * 0.17)) * textScale : 0;
  const gutterLeft = l + pad;
  const left = gutterLeft + gutter;
  const right = Math.max(left + 1, width - r - pad);

  const lanes: Lane[] = [];
  for (let i = 0; i < count; i++) {
    const row = count - 1 - i; // Crown (last ring) in the top row
    const laneTop = top + row * laneH;
    lanes.push({ id: ids[i] ?? '', index: i, top: laneTop, bottom: laneTop + laneH, mid: laneTop + laneH / 2 });
  }
  // Inline labels sit in the top part of each lane, so the curve centre shifts down a little.
  if (labelMode === 'inline') for (const lane of lanes) lane.mid = lane.top + laneH * 0.58;
  const half = labelMode === 'inline' ? laneH * 0.42 : laneH / 2;
  return {
    left,
    right,
    top,
    bottom,
    gutterLeft,
    labelMode,
    laneH,
    yScale: (half * LANE_FILL) / AMP_MAX,
    lanes,
    axisY: bottom + 8 * textScale,
  };
}

/** y(x) = A·w(k·x + φ) in normalized units (same units as the mandala's radius). */
export function waveValue(frame: RingFrame, x: number, phiOffset = 0): number {
  return frame.A * wave(frame.spec.waveform, frame.spec.k * x + frame.phi + phiOffset);
}

/** Samples a lane's curve into screen-space points, x from 0 to 2π inclusive. */
export function sampleLane(frame: RingFrame, lane: Lane, layout: WavesLayout, samples: number, phiOffset = 0): Float64Array {
  const pts = new Float64Array((samples + 1) * 2);
  const span = layout.right - layout.left;
  for (let j = 0; j <= samples; j++) {
    const u = j / samples;
    pts[j * 2] = layout.left + u * span;
    pts[j * 2 + 1] = lane.mid - waveValue(frame, u * TAU, phiOffset) * layout.yScale;
  }
  return pts;
}

export interface WavesSceneOptions {
  width: number;
  height: number;
  t: number;
  keyPitchClass: number;
  focusId: string | null;
  inset?: Insets;
  /** Draw lane names and equations into the scene (exports). On screen they're DOM. */
  labels?: boolean;
  /** Multiplier for text and stroke sizes (exports render larger). */
  textScale?: number;
  /** Max samples per curve; defaults to one per pixel. */
  samples?: number;
}

export interface WavesScene {
  layout: WavesLayout;
  frames: RingFrame[];
  prims: Prim[];
}

const THETA_TICKS: [number, string][] = [
  [0, '0'],
  [0.25, 'π/2'],
  [0.5, 'π'],
  [0.75, '3π/2'],
  [1, '2π'],
];

export function buildWavesScene(rings: RingSpec[], o: WavesSceneOptions): WavesScene {
  const ts = o.textScale ?? 1;
  const layout = wavesLayout(o.width, o.height, rings.map((r) => r.id), o.inset, ts);
  const frames = rings.map((r) => ringFrame(r, o.t));
  const prims: Prim[] = [];
  const span = layout.right - layout.left;
  const samples = Math.max(120, Math.min(o.samples ?? 2400, Math.round(span)));
  const unit = ts;
  const guide = 'hsl(230, 30%, 70%)';

  // Focused lane: a soft band behind it.
  const focusIdx = o.focusId ? rings.findIndex((r) => r.id === o.focusId) : -1;
  if (focusIdx >= 0) {
    const lane = layout.lanes[focusIdx];
    prims.push({ type: 'rect', x: layout.gutterLeft - 6 * unit, y: lane.top + 2, w: layout.right - layout.gutterLeft + 12 * unit, h: lane.bottom - lane.top - 4, color: hsl(rings[focusIdx].hue, 60, 60), alpha: 0.07, radius: 10 * unit });
  }

  // Pitch-class guides — the mandala's 12 spokes, unrolled. The song's key is tinted with its chakra's colour.
  const keyRing = pitchClassToChakras(o.keyPitchClass)[0][0];
  const narrow = span < 520;
  for (let pc = 0; pc < 12; pc++) {
    const x = layout.left + (pc / 12) * span;
    const isKey = pc === o.keyPitchClass;
    const color = isKey ? hsl(rings[keyRing]?.hue ?? 0, 90, 70) : guide;
    prims.push({ type: 'line', x1: x, y1: layout.top, x2: x, y2: layout.bottom, color, width: (isKey ? 1.2 : 0.6) * unit, alpha: isKey ? 0.32 : 0.07 });
    const natural = !PITCH_NAMES[pc].includes('♯');
    if (!narrow || natural || isKey) {
      prims.push({ type: 'text', x, y: layout.top - 6 * unit, text: PITCH_NAMES[pc], color: isKey ? color : guide, alpha: isKey ? 0.95 : 0.4, size: 10 * ts, weight: isKey ? 600 : 400, align: 'center', baseline: 'bottom' });
    }
  }
  // Closing guide at 2π (same angle as 0).
  prims.push({ type: 'line', x1: layout.right, y1: layout.top, x2: layout.right, y2: layout.bottom, color: guide, width: 0.6 * unit, alpha: 0.07 });

  // θ axis.
  for (const [u, label] of THETA_TICKS) {
    const x = layout.left + u * span;
    prims.push({ type: 'line', x1: x, y1: layout.bottom, x2: x, y2: layout.bottom + 4 * unit, color: guide, width: 1 * unit, alpha: 0.35 });
    prims.push({ type: 'text', x, y: layout.axisY, text: label, color: guide, alpha: 0.6, size: 10.5 * ts, font: 'mono', align: u === 0 ? 'left' : u === 1 ? 'right' : 'center', baseline: 'top' });
  }
  prims.push({ type: 'text', x: layout.left + span * 0.125, y: layout.axisY, text: 'x = θ →', color: guide, alpha: 0.35, size: 10 * ts, font: 'mono', align: 'center', baseline: 'top' });

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const lane = layout.lanes[i];
    const { spec, highlight: h } = f;
    const dim = o.focusId && o.focusId !== spec.id ? 0.3 : 1;
    const focused = o.focusId === spec.id;
    const act = colourAmount(h);
    const color = hsl(spec.hue, 96 * act, 52 + 6 * act + 14 * h);

    // Lane separator and zero line; dotted bounds at ±Aₘₐₓ.
    if (i < frames.length - 1) {
      prims.push({ type: 'line', x1: layout.gutterLeft, y1: lane.top, x2: layout.right, y2: lane.top, color: guide, width: 0.6 * unit, alpha: 0.06 });
    }
    const zero = new Float64Array([layout.left, lane.mid, layout.right, lane.mid]);
    prims.push({ type: 'path', pts: zero, closed: false, color: guide, width: 0.6 * unit, alpha: 0.16, additive: false, dash: [2 * unit, 6 * unit] });
    const bound = spec.ampMax * layout.yScale;
    for (const y of [lane.mid - bound, lane.mid + bound]) {
      prims.push({ type: 'path', pts: new Float64Array([layout.left, y, layout.right, y]), closed: false, color: guide, width: 0.5 * unit, alpha: 0.05, additive: false, dash: [1 * unit, 5 * unit] });
    }

    const w = (1.4 + 1.4 * h + (focused ? 1.2 : 0)) * unit;
    const pts = sampleLane(f, lane, layout, samples);
    const ghost = sampleLane(f, lane, layout, samples, Math.PI);
    prims.push({ type: 'path', pts: ghost, closed: false, color: hsl(spec.hue, 80 * act, 60), width: 0.8 * unit, alpha: 0.2 * dim, additive: true });
    prims.push({ type: 'path', pts, closed: false, color, width: w * 6, alpha: (0.05 + 0.06 * h) * dim, additive: true });
    prims.push({ type: 'path', pts, closed: false, color, width: w * 2.6, alpha: (0.14 + 0.12 * h) * dim, additive: true });
    prims.push({ type: 'path', pts, closed: false, color, width: w, alpha: 0.95 * dim, additive: true });

    if (o.labels) {
      const swatch = hsl(spec.hue, 96, 62);
      const lx = layout.labelMode === 'gutter' ? layout.gutterLeft : layout.left;
      const ly = layout.labelMode === 'gutter' ? lane.mid - 9 * ts : lane.top + 6 * ts;
      prims.push({ type: 'dot', cx: lx + 5 * ts, cy: ly + (layout.labelMode === 'gutter' ? 0 : 6 * ts), r: 4 * ts, color: swatch, alpha: 0.95, additive: false });
      const tx = lx + 15 * ts;
      const nameY = layout.labelMode === 'gutter' ? ly : ly + 6 * ts;
      prims.push({ type: 'text', x: tx, y: nameY, text: spec.name, color: '#ffffff', alpha: 0.92 * Math.max(dim, 0.6), size: 13 * ts, weight: 600, align: 'left', baseline: 'middle' });
      const eq = waveEquation(f.A, spec.k, f.phi);
      if (layout.labelMode === 'gutter') {
        prims.push({ type: 'text', x: tx, y: ly + 17 * ts, text: spec.band, color: guide, alpha: 0.7, size: 10.5 * ts, align: 'left', baseline: 'middle' });
        prims.push({ type: 'text', x: tx, y: ly + 32 * ts, text: eq, color: guide, alpha: 0.6, size: 10 * ts, font: 'mono', align: 'left', baseline: 'middle' });
      } else {
        prims.push({ type: 'text', x: layout.right, y: nameY, text: eq, color: guide, alpha: 0.6, size: 10 * ts, font: 'mono', align: 'right', baseline: 'middle' });
      }
    }
  }

  return { layout, frames, prims };
}

/** Live equation text, e.g. "y = 0.034·w(24x + 1.23)", with φ reduced to [0, 2π). */
export function waveEquation(A: number, k: number, phi: number): string {
  const p = ((phi % TAU) + TAU) % TAU;
  return `y = ${A.toFixed(3)}·w(${k}x + ${p.toFixed(2)})`;
}

/** The ring whose lane contains the point (gutter included), or null. */
export function wavesHitTest(layout: WavesLayout, px: number, py: number): string | null {
  if (px < layout.gutterLeft - 8 || px > layout.right + 8) return null;
  for (const lane of layout.lanes) if (py >= lane.top && py < lane.bottom) return lane.id || null;
  return null;
}
