import { useEffect, useRef, useState } from 'react';
import type { ResolvedFeatures } from '../features/types';
import { prefersReducedMotion } from '../hooks/useMediaQuery';
import type { ViewMode } from '../lib/url';
import { hsl } from '../mandala/color';
import { hitTest, ringFrame, type RingFrame } from '../mandala/geometry';
import { drawPrims } from '../mandala/render';
import { sectionAngles, type RingSpec } from '../mandala/rings';
import { buildScene, sceneGeometry, type Insets } from '../mandala/scene';
import { buildWavesScene, waveEquation, waveValue, wavesHitTest, type WavesLayout } from '../mandala/waves';
import type { PlaybackClock } from '../playback/clock';

interface Props {
  view: ViewMode;
  rings: RingSpec[];
  features: ResolvedFeatures;
  durationMs: number;
  /** Null renders the ambient idle animation (no track loaded). */
  clock: PlaybackClock | null;
  interactive: boolean;
  hoverId: string | null;
  selectedId: string | null;
  onHover(id: string | null): void;
  onSelect(id: string | null): void;
  /** Space taken by the surrounding UI; the drawing eases into the remaining area. */
  inset: Required<Insets>;
  /** Freeze the idle (no track) animation. */
  idlePaused?: boolean;
}

const TAU = Math.PI * 2;
const IDLE_T0 = 12;
const now0 = () => performance.now();

/** Mandala on short screens: let it run under the header/transport rather than shrink to nothing. */
const mandalaInset = (h: number, i: Required<Insets>): Required<Insets> => (h > 560 ? i : { ...i, top: 0, bottom: 0 });

const PI_LABELS: [number, string][] = [
  [0, '0'],
  [0.125, 'π/4'],
  [0.25, 'π/2'],
  [0.375, '3π/4'],
  [0.5, 'π'],
  [0.625, '5π/4'],
  [0.75, '3π/2'],
  [0.875, '7π/4'],
  [1, '2π'],
];
function thetaLabel(u: number): string {
  const near = PI_LABELS.find(([v]) => Math.abs(v - u) < 0.006);
  return near ? near[1] : (u * TAU).toFixed(2);
}

interface HitState {
  view: ViewMode;
  frames: RingFrame[];
  w: number;
  h: number;
  inset: Required<Insets>;
  waves: WavesLayout | null;
}

interface Tip {
  x: number;
  y: number;
  id: string;
}

export function Visualizer(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const hitRef = useRef<HitState>({ view: props.view, frames: [], w: 0, h: 0, inset: props.inset, waves: null });
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  const eqRefs = useRef(new Map<string, HTMLSpanElement>());
  const meterRefs = useRef(new Map<string, HTMLSpanElement>());
  const crossRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const tipRef = useRef<Tip | null>(null);
  tipRef.current = tip;
  const readoutRef = useRef<HTMLSpanElement>(null);
  const [labelMode, setLabelMode] = useState<'gutter' | 'inline'>('gutter');

  // View switches cross-fade: fade out, swap, fade in.
  const [shownView, setShownView] = useState(props.view);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (props.view === shownView) {
      setFading(false); // toggled back before the fade finished
      return;
    }
    if (prefersReducedMotion()) {
      setShownView(props.view);
      return;
    }
    setFading(true);
    const id = window.setTimeout(() => {
      setShownView(props.view);
      setFading(false);
    }, 140);
    return () => clearTimeout(id);
  }, [props.view, shownView]);
  const shownViewRef = useRef(shownView);
  shownViewRef.current = shownView;

  // 60fps render loop, decoupled from React renders.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const cur = { ...propsRef.current.inset };
    let lastLabelUpdate = 0;
    let lastMode: 'gutter' | 'inline' | null = null;
    let idleT = IDLE_T0;
    let lastNow = now0();

    const loop = (now: number) => {
      const p = propsRef.current;
      const view = shownViewRef.current;
      const reduced = prefersReducedMotion();
      // Ease the drawing towards the free area (snap when reduced motion is on).
      const k = reduced ? 1 : 0.16;
      for (const key of ['top', 'bottom', 'left', 'right'] as const) {
        const d = p.inset[key] - cur[key];
        cur[key] = Math.abs(d) < 0.5 ? p.inset[key] : cur[key] + d * k;
      }
      const dur = p.durationMs / 1000;
      // Idle: drift slowly through the demo song so the landing screen breathes (frozen when paused or with reduced motion).
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      if (!p.clock && !reduced && !p.idlePaused) idleT = (idleT + dt * 0.35) % dur;
      const t = p.clock ? p.clock.nowMs() / 1000 : idleT;
      const focusId = p.selectedId ?? p.hoverId;

      if (view === 'waves') {
        const scene = buildWavesScene(p.rings, { width: w, height: h, t, keyPitchClass: p.features.key, focusId, inset: cur });
        hitRef.current = { view, frames: scene.frames, w, h, inset: { ...cur }, waves: scene.layout };
        drawPrims(ctx, scene.prims, w, h, null);
        const L = scene.layout;
        if (L.labelMode !== lastMode) {
          lastMode = L.labelMode;
          setLabelMode(L.labelMode);
        }
        // Lane labels are DOM (accessible buttons); keep them glued to their lanes.
        const updateText = now - lastLabelUpdate > 90;
        if (updateText) lastLabelUpdate = now;
        for (let i = 0; i < scene.frames.length; i++) {
          const f = scene.frames[i];
          const lane = L.lanes[i];
          const el = labelRefs.current.get(f.spec.id);
          if (el) {
            const x = L.labelMode === 'gutter' ? L.gutterLeft - 8 : L.left - 6;
            const y = L.labelMode === 'gutter' ? lane.mid : lane.top + 3;
            el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)${L.labelMode === 'gutter' ? ' translateY(-50%)' : ''}`;
            el.style.width = L.labelMode === 'gutter' ? `${(L.left - L.gutterLeft - 8).toFixed(0)}px` : '';
            el.style.opacity = focusId && focusId !== f.spec.id ? '0.55' : '1';
            el.dataset.compact = L.laneH < 78 ? '1' : '0';
            // Very short inline lanes: only the focused lane keeps its label, so text never covers the curves.
            el.style.visibility = L.labelMode === 'inline' && L.laneH < 34 && focusId !== f.spec.id ? 'hidden' : '';
          }
          if (updateText) {
            const eq = eqRefs.current.get(f.spec.id);
            if (eq) eq.textContent = waveEquation(f.A, f.spec.k, f.phi);
            const m = meterRefs.current.get(f.spec.id);
            if (m) m.style.transform = `scaleX(${Math.max(0.02, Math.min(1, f.highlight)).toFixed(3)})`;
          }
        }
        // Crosshair readout follows the pointer.
        const tp = tipRef.current;
        if (crossRef.current) {
          if (tp && tp.x >= L.left && tp.x <= L.right) {
            crossRef.current.style.display = 'block';
            crossRef.current.style.transform = `translateX(${tp.x.toFixed(1)}px)`;
            crossRef.current.style.top = `${L.top}px`;
            crossRef.current.style.height = `${L.bottom - L.top}px`;
            const fi = scene.frames.findIndex((f) => f.spec.id === tp.id);
            if (readoutRef.current && fi >= 0) {
              const u = (tp.x - L.left) / (L.right - L.left);
              const y = waveValue(scene.frames[fi], u * TAU);
              readoutRef.current.textContent = `θ = ${thetaLabel(u)}   y = ${y >= 0 ? '+' : '−'}${Math.abs(y).toFixed(4)}`;
            }
          } else crossRef.current.style.display = 'none';
        }
      } else {
        const inset = mandalaInset(h, cur);
        const scene = buildScene(p.rings, {
          width: w,
          height: h,
          t,
          durationSec: dur,
          sectionAngles: sectionAngles(p.features, dur),
          keyPitchClass: p.features.key,
          focusId,
          samples: 720,
          inset,
        });
        hitRef.current = { view, frames: scene.frames, w, h, inset, waves: null };
        drawPrims(ctx, scene.prims, w, h, null);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const pick = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const s = hitRef.current;
    if (s.view === 'waves' && s.waves) return { x, y, id: wavesHitTest(s.waves, x, y) };
    const { cx, cy, scale } = sceneGeometry(s.w, s.h, s.inset);
    return { x, y, id: hitTest(s.frames, x, y, cx, cy, scale) };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!props.interactive || e.pointerType === 'touch') return;
    const { x, y, id } = pick(e);
    if (id !== props.hoverId) props.onHover(id);
    setTip(id ? { x, y, id } : null);
  };

  const onClick = (e: React.PointerEvent) => {
    if (!props.interactive || e.button > 0) return;
    const { id } = pick(e);
    props.onSelect(id === props.selectedId ? null : id);
  };

  // Drop a stale tooltip/crosshair when interaction turns off (UI hidden, track unloaded).
  useEffect(() => {
    if (!props.interactive) setTip(null);
  }, [props.interactive]);

  const tipRing = tip && props.rings.find((r) => r.id === tip.id);
  const waves = shownView === 'waves';

  return (
    <div className={`absolute inset-0 transition-opacity duration-150 ${fading ? 'opacity-0' : 'opacity-100'}`}>
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-manipulation"
        style={{ cursor: props.interactive && props.hoverId ? 'pointer' : waves && props.interactive ? 'crosshair' : 'default' }}
        onPointerMove={onMove}
        onPointerLeave={() => {
          setTip(null);
          props.onHover(null);
        }}
        onPointerUp={onClick}
        role="img"
        aria-label={
          waves
            ? 'Seven chakra wave functions drawn as horizontal lanes, Crown at the top to Root at the bottom.'
            : 'Song mandala of seven chakra rings, Root in the centre to Crown on the outside.'
        }
      />

      {waves && (
        <>
          <div ref={crossRef} className="pointer-events-none absolute left-0 hidden w-px bg-white/25" aria-hidden />
          <div className="pointer-events-none absolute inset-0" aria-hidden={!props.interactive}>
            {props.rings.map((r) => {
              const color = hsl(r.hue, 96, 62);
              const active = r.id === props.selectedId;
              return (
                <button
                  key={r.id}
                  ref={(el) => {
                    if (el) labelRefs.current.set(r.id, el);
                    else labelRefs.current.delete(r.id);
                  }}
                  type="button"
                  tabIndex={props.interactive ? 0 : -1}
                  disabled={!props.interactive}
                  aria-pressed={active}
                  aria-label={`${r.name} chakra, ${r.band}. ${active ? 'Close' : 'Open'} inspector`}
                  onClick={() => props.onSelect(active ? null : r.id)}
                  onMouseEnter={() => props.onHover(r.id)}
                  onMouseLeave={() => props.onHover(null)}
                  onFocus={() => props.onHover(r.id)}
                  onBlur={() => props.onHover(null)}
                  className={`pointer-events-auto absolute top-0 left-0 rounded-lg text-left transition-[background-color,opacity] duration-150 will-change-transform disabled:pointer-events-none ${
                    labelMode === 'gutter' ? 'px-2 py-1.5' : 'flex items-center gap-2 px-1.5 py-0.5'
                  } ${active ? 'bg-white/10' : 'hover:bg-white/6'}`}
                >
                  {labelMode === 'gutter' ? (
                    <>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                        <span className="truncate text-[13px] font-semibold text-white/95">{r.name}</span>
                      </span>
                      <span className="mt-0.5 block truncate pl-[18px] text-[11px] text-white/50">{r.band}</span>
                      <span
                        ref={(el) => {
                          if (el) eqRefs.current.set(r.id, el);
                          else eqRefs.current.delete(r.id);
                        }}
                        className="lane-eq mt-0.5 block truncate pl-[18px] font-mono text-[10.5px] text-white/45 tabular-nums"
                      />
                      <span className="mt-1 ml-[18px] block h-[3px] overflow-hidden rounded-full bg-white/8">
                        <span
                          ref={(el) => {
                            if (el) meterRefs.current.set(r.id, el);
                            else meterRefs.current.delete(r.id);
                          }}
                          className="block h-full origin-left rounded-full"
                          style={{ background: color, transform: 'scaleX(0)' }}
                        />
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                      <span className="text-[12px] font-semibold text-white/90">{r.name}</span>
                      <span className="text-[10.5px] text-white/45">{r.band}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {tipRing && tip && (
        <div
          className="glass pointer-events-none absolute z-20 rounded-lg px-3 py-2 text-xs shadow-xl"
          style={{
            left: Math.min(tip.x + 14, (hitRef.current.w || 9999) - 230),
            top: tip.y + 14,
          }}
        >
          <div className="flex items-center gap-2 font-semibold text-white">
            <span className="h-2 w-2 rounded-full" style={{ background: hsl(tipRing.hue, 96, 62), boxShadow: `0 0 8px ${hsl(tipRing.hue, 96, 62)}` }} />
            {tipRing.name}
            <span className="font-normal text-white/50">{tipRing.band}</span>
          </div>
          {waves ? (
            <div className="mt-1 font-mono text-[11px] whitespace-pre text-white/75 tabular-nums">
              <span ref={readoutRef}>{tipReadoutFallback(tipRing, props.clock)}</span>
            </div>
          ) : (
            <div className="mt-0.5 text-white/70">{tipRing.driver} · click to inspect</div>
          )}
        </div>
      )}
    </div>
  );
}

/** First paint of the readout before the render loop fills it in. */
function tipReadoutFallback(ring: RingSpec, clock: PlaybackClock | null): string {
  const f = ringFrame(ring, (clock?.nowMs() ?? IDLE_T0 * 1000) / 1000);
  return waveEquation(f.A, ring.k, f.phi);
}
