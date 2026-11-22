import { useClockTick } from '../hooks/useClockTick';
import { hsl } from '../mandala/color';
import type { RingSpec } from '../mandala/rings';
import type { PlaybackClock } from '../playback/clock';

interface Props {
  ring: RingSpec;
  clock: PlaybackClock;
  onClose(): void;
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

export function Inspector({ ring, clock, onClose }: Props) {
  const { ms } = useClockTick(clock, 10);
  const t = ms / 1000;
  const A = ring.amplitude(t);
  const phi = ((ring.phase(t) % TAU) + TAU) % TAU;
  const color = hsl(ring.hue, 96, 62);

  return (
    <aside
      className="glass absolute top-[88px] right-3 bottom-28 z-30 flex w-[min(380px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl max-md:top-auto max-md:bottom-48 max-md:max-h-[50%]"
      aria-label={`${ring.name} ring inspector`}
    >
      <div className="flex items-start gap-3 border-b border-white/10 p-4">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-white">
            {ring.name} <span className="text-xs font-normal text-white/45">chakra {ring.index + 1} of 7</span>
          </h2>
          <p className="mt-0.5 text-xs text-white/60">{ring.role}</p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close inspector">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-white/40 uppercase">Driven by</h3>
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
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-white/40 uppercase">Polar mapping</h3>
          <div className="rounded-lg bg-black/40 p-3 font-mono text-xs leading-relaxed text-white/85">
            <div className="text-white/50">rᵢ(θ,t) = Rᵢ + Aᵢ(t)·wᵢ(kᵢθ + φᵢ(t))</div>
            <div className="mt-1">
              r(θ,t) = <span style={{ color }}>{f3(ring.R)}</span> + <span style={{ color }}>{f3(A)}</span>·w(
              <span style={{ color }}>{ring.k}</span>θ + <span style={{ color }}>{phi.toFixed(2)}</span>)
            </div>
            <div className="mt-1 text-white/50">x = r·cos θ,  y = r·sin θ</div>
            <div className="mt-2 border-t border-white/10 pt-2">w(x) = {ring.waveformLabel}</div>
            <div className="mt-1">{ring.amplitudeExpr}</div>
            <div className="mt-1">{ring.phaseExpr}</div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-white/40 uppercase">Parameters</h3>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Base radius Rᵢ', f3(ring.R)],
              ['Symmetry lobes kᵢ', String(ring.k)],
              ['Amplitude Aᵢ(t)', f3(A)],
              ['A bounds', `[${f3(ring.ampMin)}, ${f3(ring.ampMax)}]`],
              ['Phase φᵢ(t) mod 2π', `${phi.toFixed(3)} rad`],
              ['Radial span', `[${f3(ring.R - ring.ampMax)}, ${f3(ring.R + ring.ampMax)}]`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md bg-white/5 px-2.5 py-2">
                <dt className="text-white/45">{k}</dt>
                <dd className="mt-0.5 font-mono text-white/90 tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-white/40">
            Units are fractions of the mandala's outer radius. Amplitude is clamped to its bounds so a ring never crosses
            the centre line of its neighbours.
          </p>
        </section>
      </div>
    </aside>
  );
}
