import { useEffect, useRef, useState } from 'react';
import type { ResolvedFeatures } from '../features/types';
import { hitTest, type RingFrame } from '../mandala/geometry';
import { drawPrims } from '../mandala/render';
import { sectionAngles, type RingSpec } from '../mandala/rings';
import { buildScene, sceneGeometry } from '../mandala/scene';
import type { PlaybackClock } from '../playback/clock';
import { hsl } from '../mandala/color';

interface Props {
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
}

/** Keep clear of the header and transport bar; on short screens let them overlap. */
const insetFor = (h: number) => (h > 560 ? { top: 84, bottom: 92 } : { top: 0, bottom: 0 });

export function MandalaCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const framesRef = useRef<{ frames: RingFrame[]; w: number; h: number }>({ frames: [], w: 0, h: 0 });
  const [tip, setTip] = useState<{ x: number; y: number; id: string } | null>(null);

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

    const idleStart = performance.now();
    const loop = () => {
      const p = propsRef.current;
      const dur = p.durationMs / 1000;
      // Idle: drift slowly through the demo song so the landing screen breathes.
      const t = p.clock ? p.clock.nowMs() / 1000 : (((performance.now() - idleStart) / 1000) * 0.35 + 12) % dur;
      const scene = buildScene(p.rings, {
        width: w,
        height: h,
        t,
        durationSec: dur,
        sectionAngles: sectionAngles(p.features, dur),
        keyPitchClass: p.features.key,
        focusId: p.selectedId ?? p.hoverId,
        samples: 720,
        inset: insetFor(h),
      });
      framesRef.current = { frames: scene.frames, w, h };
      drawPrims(ctx, scene.prims, w, h, null);
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
    const { frames, w, h } = framesRef.current;
    const { cx, cy, scale } = sceneGeometry(w, h, insetFor(h));
    return { x, y, id: hitTest(frames, x, y, cx, cy, scale) };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!props.interactive || e.pointerType === 'touch') return;
    const { x, y, id } = pick(e);
    if (id !== props.hoverId) props.onHover(id);
    setTip(id ? { x, y, id } : null);
  };

  const onClick = (e: React.PointerEvent) => {
    if (!props.interactive) return;
    const { id } = pick(e);
    props.onSelect(id === props.selectedId ? null : id);
  };

  const tipRing = tip && props.rings.find((r) => r.id === tip.id);

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ cursor: props.hoverId ? 'pointer' : 'default' }}
        onPointerMove={onMove}
        onPointerLeave={() => {
          setTip(null);
          props.onHover(null);
        }}
        onPointerUp={onClick}
        role="img"
        aria-label="Song mandala. Use the ring list to inspect each wave ring."
      />
      {tipRing && tip && (
        <div
          className="glass pointer-events-none absolute z-20 rounded-lg px-3 py-2 text-xs shadow-xl"
          style={{ left: tip.x + 14, top: tip.y + 14 }}
        >
          <div className="flex items-center gap-2 font-semibold text-white">
            <span className="h-2 w-2 rounded-full" style={{ background: hsl(tipRing.hue, 96, 62), boxShadow: `0 0 8px ${hsl(tipRing.hue, 96, 62)}` }} />
            {tipRing.name}
            <span className="font-normal text-white/50">{tipRing.band}</span>
          </div>
          <div className="mt-0.5 text-white/70">{tipRing.driver} · click to inspect</div>
        </div>
      )}
    </div>
  );
}
