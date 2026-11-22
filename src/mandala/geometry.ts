import type { RingSpec } from './rings';
import { RING_GAP } from './rings';
import { wave } from './waveforms';

const TAU = Math.PI * 2;
/** θ = 0 is drawn at 12 o'clock so the structure ring reads like a clock face. */
export const THETA0 = -Math.PI / 2;

export interface RingFrame {
  spec: RingSpec;
  A: number;
  phi: number;
  highlight: number;
}

export function ringFrame(spec: RingSpec, t: number): RingFrame {
  return { spec, A: spec.amplitude(t), phi: spec.phase(t), highlight: spec.highlight(t) };
}

/** r_i(θ) = R_i + A·w(k·θ + φ), in normalized units. θ measured from THETA0. */
export function ringRadius(frame: RingFrame, theta: number, phiOffset = 0): number {
  const { spec, A, phi } = frame;
  return spec.R + A * wave(spec.waveform, spec.k * theta + phi + phiOffset);
}

/**
 * Samples the closed polar curve into screen-space points.
 * Returns a flat [x0, y0, x1, y1, ...] array of `samples` points, starting at 12 o'clock.
 */
export function sampleRing(
  frame: RingFrame,
  samples: number,
  cx: number,
  cy: number,
  scale: number,
  phiOffset = 0,
): Float64Array {
  const pts = new Float64Array(samples * 2);
  for (let j = 0; j < samples; j++) {
    const theta = (TAU * j) / samples;
    const r = ringRadius(frame, theta, phiOffset) * scale;
    const a = THETA0 + theta;
    pts[j * 2] = cx + r * Math.cos(a);
    pts[j * 2 + 1] = cy + r * Math.sin(a);
  }
  return pts;
}

/**
 * Finds the ring under a point. Compares the pointer's normalized radius with
 * each ring's radius at the pointer's angle — exact for these polar curves.
 */
export function hitTest(
  frames: RingFrame[],
  px: number,
  py: number,
  cx: number,
  cy: number,
  scale: number,
): string | null {
  const dx = px - cx;
  const dy = py - cy;
  const rho = Math.hypot(dx, dy) / scale;
  let theta = Math.atan2(dy, dx) - THETA0;
  theta = ((theta % TAU) + TAU) % TAU;
  let best: string | null = null;
  let bestD = RING_GAP * 0.45;
  for (const f of frames) {
    const d = Math.abs(rho - ringRadius(f, theta));
    if (d < bestD) {
      bestD = d;
      best = f.spec.id;
    }
  }
  return best;
}
