import { forwardRef, useEffect, useRef } from 'react';
import { useClockTick } from '../hooks/useClockTick';
import type { ViewMode } from '../lib/url';
import { hsl } from '../mandala/color';
import type { RingSpec } from '../mandala/rings';
import type { PlaybackClock } from '../playback/clock';
import { ChevronLeft, ChevronRight, CloseIcon } from './icons';

interface Props {
  ring: RingSpec;
  clock: PlaybackClock;
  view: ViewMode;
  onClose(): void;
  onStep(delta: 1 | -1): void;
}

const TAU = Math.PI * 2;
const f3 = (v: number) => v.toFixed(3);

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const derived = source.startsWith('Derived');
  return (
    <span
      className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${derived ? 'bg-amber-400/15 text-amber-200/80' : 'bg-emerald-400/15 text-emerald-200/80'}`}
      title={source}
    >
      {derived ? 'derived' : source.replace(/ audio features$/, '')}
    </span>
  );
}

export const Inspector = forwardRef<HTMLElement, Props>(function Inspector({ ring, clock, view, onClose, onStep }, ref) {
  const { ms } = useClockTick(clock, 10);
  const t = ms / 1000;
  const A = ring.amplitude(t);
  const phi = ((ring.phase(t) % TAU) + TAU) % TAU;
  const strength = ring.highlight(t);
  const color = hsl(ring.hue, 96, 62);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const asideRef = useRef<HTMLElement | null>(null);

  // Move focus into the panel when it opens, so keyboard users land on it.
  useEffect(() => {
    if (document.activeElement === document.body) headingRef.current?.focus();
  }, [ring.id]);

  // When the panel closes, give focus back to where it came from instead of dropping it to <body>.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const panel = asideRef.current;
    return () => {
      const lost = !document.activeElement || document.activeElement === document.body || panel?.contains(document.activeElement);
      if (lost && opener?.isConnected && !opener.closest('[inert]')) opener.focus();
    };
  }, []);

  const accent = (v: string) => <span style={{ color }}>{v}</span>;

  return (
    <aside
      ref={(el) => {
        asideRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      className="chrome glass panel-in absolute top-[calc(var(--header-h,72px)+8px)] right-3 bottom-[calc(var(--transport-h,96px)+8px)] z-30 flex w-[min(380px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl max-md:top-auto max-md:left-3 max-md:max-h-[min(40%,360px)] max-md:w-auto"
      aria-labelledby="inspector-title"
      data-inspector
    >
      <div className="flex items-start gap-3 border-b border-white/10 p-4">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}` }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="inspector-title" ref={headingRef} tabIndex={-1} className="text-base font-semibold text-white outline-none">
            {ring.name} <span className="text-xs font-normal text-white/45">chakra {ring.index + 1} of 7</span>
          </h2>
          <p className="mt-0.5 text-xs leading-snug text-white/60">{ring.role}</p>
        </div>
        <div className="-mt-1 -mr-1 flex shrink-0 items-center">
          <button onClick={() => onStep(-1)} className="icon-btn h-8 w-8" aria-label="Previous chakra" title="Previous chakra ([)">
            <ChevronLeft />
          </button>
          <button onClick={() => onStep(1)} className="icon-btn h-8 w-8" aria-label="Next chakra" title="Next chakra (])">
            <ChevronRight />
          </button>
          <button onClick={onClose} className="icon-btn h-8 w-8" aria-label="Close inspector" title="Close (Esc)">
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 text-sm">
        <section>
          <div className="mb-1.5 flex items-baseline justify-between">
            <h3 className="section-title mb-0">Present right now</h3>
            <span className="font-mono text-xs text-white/70 tabular-nums">{Math.round(strength * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/8" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(strength * 100)} aria-label={`${ring.name} presence`}>
            <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${Math.min(100, strength * 100)}%`, background: color }} />
          </div>
        </section>

        <section>
          <h3 className="section-title">Driven by</h3>
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-white/5 px-2 py-1 text-white/80">{ring.band}</span>
            <span className="rounded-md bg-white/5 px-2 py-1 text-white/80">{ring.driver}</span>
          </div>
          <dl className="divide-y divide-white/5">
            {ring.inputs.map((p) => (
              <div key={p.label} className="flex items-center justify-between gap-3 py-1.5">
                <dt className="text-white/50">{p.label}</dt>
                <dd className="text-right text-white/90">
                  {p.value}
                  <SourceBadge source={p.source} />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3 className="section-title">{view === 'waves' ? 'Wave function' : 'Polar mapping'}</h3>
          <div className="rounded-lg bg-black/40 p-3 font-mono text-xs leading-relaxed text-white/85">
            {view === 'waves' ? (
              <>
                <div className="text-white/50">yᵢ(x,t) = Aᵢ(t)·wᵢ(kᵢx + φᵢ(t)),  x = θ ∈ [0, 2π)</div>
                <div className="mt-1">
                  y(x,t) = {accent(f3(A))}·w({accent(String(ring.k))}x + {accent(phi.toFixed(2))})
                </div>
                <div className="mt-1 text-white/50">Mandala radius: r = Rᵢ + y = {f3(ring.R)} + y</div>
              </>
            ) : (
              <>
                <div className="text-white/50">rᵢ(θ,t) = Rᵢ + Aᵢ(t)·wᵢ(kᵢθ + φᵢ(t))</div>
                <div className="mt-1">
                  r(θ,t) = {accent(f3(ring.R))} + {accent(f3(A))}·w({accent(String(ring.k))}θ + {accent(phi.toFixed(2))})
                </div>
                <div className="mt-1 text-white/50">x = r·cos θ,  y = r·sin θ</div>
              </>
            )}
            <div className="mt-2 border-t border-white/10 pt-2">w(x) = {ring.waveformLabel}</div>
            <div className="mt-1 break-words">{ring.amplitudeExpr}</div>
            <div className="mt-1 break-words">{ring.phaseExpr}</div>
          </div>
        </section>

        <section>
          <h3 className="section-title">Parameters</h3>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Base radius Rᵢ', f3(ring.R)],
              ['Symmetry lobes kᵢ', String(ring.k)],
              ['Amplitude Aᵢ(t)', f3(A)],
              ['A bounds', `[${f3(ring.ampMin)}, ${f3(ring.ampMax)}]`],
              ['Phase φᵢ(t) mod 2π', `${phi.toFixed(3)} rad`],
              view === 'waves' ? ['y range', `[${f3(-ring.ampMax)}, ${f3(ring.ampMax)}]`] : ['Radial span', `[${f3(ring.R - ring.ampMax)}, ${f3(ring.R + ring.ampMax)}]`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md bg-white/5 px-2.5 py-2">
                <dt className="text-white/45">{k}</dt>
                <dd className="mt-0.5 font-mono text-white/90 tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] leading-snug text-white/40">
            Units are fractions of the mandala’s outer radius, in both views. Amplitude is clamped to its bounds so a ring
            never crosses the centre line of its neighbours.
          </p>
        </section>
      </div>
    </aside>
  );
});
