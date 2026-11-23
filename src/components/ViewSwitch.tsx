import { useRef } from 'react';
import type { ViewMode } from '../lib/url';
import { MandalaIcon, WavesIcon } from './icons';

const OPTIONS: { id: ViewMode; label: string; Icon: typeof MandalaIcon; title: string }[] = [
  { id: 'mandala', label: 'Mandala', Icon: MandalaIcon, title: 'Mandala: each function wrapped around a circle (M)' },
  { id: 'waves', label: 'Waves', Icon: WavesIcon, title: 'Waves: the same functions unrolled horizontally (M)' },
];

/** Segmented control (radio group pattern: arrow keys move and select). */
export function ViewSwitch({ view, onChange }: { view: ViewMode; onChange(v: ViewMode): void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = OPTIONS.findIndex((o) => o.id === view);

  return (
    <div
      role="radiogroup"
      aria-label="View"
      className="relative flex shrink-0 rounded-xl border border-white/10 bg-black/30 p-0.5"
      onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const next = (idx + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + OPTIONS.length) % OPTIONS.length;
        onChange(OPTIONS[next].id);
        refs.current[next]?.focus();
      }}
    >
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-[10px] bg-white/12 transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${idx * 100}%)` }}
      />
      {OPTIONS.map((o, i) => {
        const checked = o.id === view;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
              checked ? 'text-white' : 'text-white/55 hover:text-white/85'
            }`}
          >
            <o.Icon size={15} />
            <span className="max-[380px]:sr-only">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
