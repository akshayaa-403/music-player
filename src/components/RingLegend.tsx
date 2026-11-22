import { hsl } from '../mandala/color';
import type { RingSpec } from '../mandala/rings';

interface Props {
  rings: RingSpec[];
  hoverId: string | null;
  selectedId: string | null;
  onHover(id: string | null): void;
  onSelect(id: string | null): void;
  sourceSummary: string;
}

/** Keyboard-accessible ring list; mirrors canvas hover/selection. */
export function RingLegend({ rings, hoverId, selectedId, onHover, onSelect, sourceSummary }: Props) {
  return (
    <nav className="glass absolute top-[88px] left-3 z-20 hidden w-52 rounded-2xl p-2 lg:block" aria-label="Wave rings">
      <div className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-wider text-white/40 uppercase">Rings · inner → outer</div>
      <ul>
        {rings.map((r) => {
          const active = r.id === selectedId || r.id === hoverId;
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
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: hsl(r.hue, 96, 62), boxShadow: `0 0 8px ${hsl(r.hue, 96, 62)}` }} />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-white/90">{r.name}</span>
                  <span className="block truncate text-[10px] text-white/45">{r.driver}</span>
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
