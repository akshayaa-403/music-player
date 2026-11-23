import { useEffect, useRef } from 'react';
import { CloseIcon } from './icons';

interface Props {
  open: boolean;
  onClose(): void;
}

export const SHORTCUTS: [keys: string[], action: string][] = [
  [['Space'], 'Play / pause'],
  [['←', '→'], 'Seek 5 s (hold Shift for 15 s)'],
  [['M'], 'Switch Mandala ↔ Waves'],
  [['1', '–', '7'], 'Inspect a chakra (Root … Crown)'],
  [['[', ']'], 'Previous / next chakra'],
  [['Esc'], 'Close panel / show interface'],
  [['H'], 'Hide the interface'],
  [['F'], 'Full screen'],
  [['/'], 'Paste a track link'],
  [['?'], 'This help'],
];

/** Native <dialog>: focus trapping, Esc and the backdrop come from the browser. */
export function HelpDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
      className="help-dialog m-auto max-h-[min(720px,calc(100dvh-32px))] w-[min(640px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-white/10 bg-[rgb(14_15_24/0.97)] p-0 text-white/85 shadow-2xl"
      aria-labelledby="help-title"
    >
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="help-title" className="text-base font-semibold text-white">
            How Harmonic Mandala works
          </h2>
          <button onClick={onClose} className="icon-btn" aria-label="Close help">
            <CloseIcon />
          </button>
        </div>
        <div className="space-y-6 overflow-y-auto px-5 py-5 text-sm leading-relaxed">
          <section>
            <h3 className="section-title">Two views of the same music</h3>
            <p className="text-white/70">
              Each of the seven chakras is one periodic function, <code className="code">w(kx + φ)</code>, whose size and
              motion follow the song.
            </p>
            <ul className="mt-2 space-y-1.5 text-white/70">
              <li>
                <strong className="text-white">Mandala</strong> wraps each function around a circle:{' '}
                <code className="code">r(θ,t) = R + A(t)·w(kθ + φ(t))</code>. Root sits in the middle, Crown on the outside.
              </li>
              <li>
                <strong className="text-white">Waves</strong> unrolls the same functions onto a horizontal axis,{' '}
                <code className="code">y(x,t) = A(t)·w(kx + φ(t))</code> for <code className="code">x = θ ∈ [0, 2π)</code>, one
                lane per chakra, so you can read amplitude, lobe count and phase directly.
              </li>
            </ul>
            <p className="mt-2 text-white/70">
              A ring rests in grey and fades into its colour while its part of the music is present. Click a ring or lane
              for its live numbers.
            </p>
          </section>

          <section>
            <h3 className="section-title">Keyboard shortcuts</h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {SHORTCUTS.map(([keys, action]) => (
                <div key={action} className="flex items-center justify-between gap-3">
                  <dt className="text-white/65">{action}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {keys.map((k) => (k === '–' ? <span key={k} className="text-white/40">–</span> : <kbd key={k} className="kbd">{k}</kbd>))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h3 className="section-title">Where the data comes from</h3>
            <ol className="list-decimal space-y-1.5 pl-5 text-white/70">
              <li>
                <strong className="text-white">Your own audio file</strong> (⋯ menu → “Analyze my audio file”): the whole song
                is analyzed second by second, in your browser. The file is never uploaded.
              </li>
              <li>
                <strong className="text-white">The official 30-second preview</strong> from Apple’s iTunes Search API, matched by
                title, artist and duration.
              </li>
              <li>
                <strong className="text-white">An estimate</strong> from the song’s key and traits when no audio is found.
              </li>
            </ol>
            <p className="mt-2 text-white/50">
              In-browser audio needs Spotify Premium. Without it, the visuals still play in sync with a silent clock. The
              chakra associations are traditional, not scientific findings.
            </p>
          </section>
        </div>
      </div>
    </dialog>
  );
}
