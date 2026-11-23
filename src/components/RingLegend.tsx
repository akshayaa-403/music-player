import { useClockTick } from '../hooks/useClockTick';
import { hsl } from '../mandala/color';
import type { RingSpec } from '../mandala/rings';
import type { PlaybackClock } from '../playback/clock';

interface Props {
  rings: RingSpec[];
  clock: PlaybackClock;
  hoverId: string | null;
  selectedId: string | null;
  onHover(id: string | null): void;
  onSelect(id: string | null): void;
  sourceSummary: string;
}

/** Keyboard-accessible ring list for the mandala view; mirrors canvas hover/selection with live presence meters. */
export function RingLegend({ rings, clock, hoverId, selectedId, onHover, onSelect, sourceSummary }: Props) {
  const { ms } = useClockTick(clock, 12);
  const t = ms / 1000;
  return (
    <nav
      className="chrome glass panel-in absolute left-3 z-20 hidden w-56 rounded-2xl p-2 lg:block"
      style={{ top: 'calc(var(--header-h, 72px) + 8px)' }}
      aria-label="Chakra rings"
    >
      <div className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-wider text-white/40 uppercase">Rings · inner → outer</div>
      <ul>
        {rings.map((r, i) => {
          const active = r.id === selectedId || r.id === hoverId;
          const color = hsl(r.hue, 96, 62);
          const level = Math.max(0, Math.min(1, r.highlight(t)));
          return (
            <li key={r.id}>
              <button
                onMouseEnter={() => onHover(r.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(r.id)}
                onBlur={() => onHover(null)}
                onClick={() => onSelect(r.id === selectedId ? null : r.id)}
                aria-pressed={r.id === selectedId}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-white/90">{r.name}</span>
                    <kbd className="font-mono text-[10px] text-white/30" aria-hidden>
                      {i + 1}
                    </kbd>
                  </span>
                  <span className="block truncate text-[10px] text-white/45">{r.driver}</span>
                  <span className="mt-1 block h-[3px] overflow-hidden rounded-full bg-white/8" aria-hidden>
                    <span className="block h-full origin-left rounded-full" style={{ background: color, transform: `scaleX(${level.toFixed(3)})` }} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-1 border-t border-white/10 px-2 pt-2 pb-1 text-[10px] leading-snug text-white/40">{sourceSummary}</div>
    </nav>
  );
}
