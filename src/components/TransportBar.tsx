import { useState } from 'react';
import { formatTime, useClockTick } from '../hooks/useClockTick';
import type { PlaybackController } from '../playback/controllers';
import type { TrackMeta } from '../spotify/api';

interface Props {
  track: TrackMeta;
  controller: PlaybackController;
  isDemo: boolean;
  onToggle(): void;
  onSeek(ms: number): void;
  onExport(kind: 'png' | 'svg', transparent: boolean): void;
  exporting: boolean;
  onAudioFile(file: File): void;
  /** 0..1 while analysing a file, null otherwise. */
  analyzingFile: number | null;
}

export function TransportBar({ track, controller, isDemo, onToggle, onSeek, onExport, exporting, onAudioFile, analyzingFile }: Props) {
  const { ms, playing } = useClockTick(controller.clock, 15);
  const [drag, setDrag] = useState<number | null>(null);
  const [transparent, setTransparent] = useState(false);
  const shown = drag ?? ms;
  const fill = track.durationMs > 0 ? (shown / track.durationMs) * 100 : 0;

  const commit = () => {
    if (drag !== null) onSeek(drag);
    setDrag(null);
  };

  return (
    <div className="glass absolute inset-x-3 bottom-3 z-30 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl px-4 py-3 md:inset-x-auto md:left-1/2 md:w-[min(960px,calc(100%-24px))] md:-translate-x-1/2 md:flex-nowrap">
      <div className="flex min-w-0 items-center gap-3 md:w-64">
        {track.albumArt ? (
          <img src={track.albumArt} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded-md bg-gradient-to-br from-amber-500 via-teal-400 to-violet-500" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white" title={track.name}>
            {track.name}
          </div>
          <div className="truncate text-xs text-white/55" title={track.artists.join(', ')}>
            {track.artists.join(', ')}
            {track.album && <span className="text-white/35"> · {track.album}</span>}
            {isDemo && <span className="text-amber-300/80"> · silent demo</span>}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 basis-full items-center gap-3 md:basis-auto">
        <button
          onClick={onToggle}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-black transition hover:scale-105"
          aria-label={playing ? 'Pause' : 'Play'}
          title={`${playing ? 'Pause' : 'Play'} (Space)`}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
            </svg>
          )}
        </button>
        <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-white/60">{formatTime(shown)}</span>
        <input
          type="range"
          className="scrub min-w-0 flex-1"
          min={0}
          max={track.durationMs}
          step={250}
          value={shown}
          style={{ '--fill': `${fill}%` } as React.CSSProperties}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          aria-label="Seek"
          aria-valuetext={`${formatTime(shown)} of ${formatTime(track.durationMs)}`}
        />
        <span className="w-10 shrink-0 font-mono text-xs tabular-nums text-white/60">{formatTime(track.durationMs)}</span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <label
          className={`cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/85 transition hover:bg-white/10 ${analyzingFile !== null ? 'pointer-events-none opacity-60' : ''}`}
          title="Have your own copy of this song? The app listens to the whole thing, second by second. The file stays on your computer."
        >
          {analyzingFile !== null ? `Listening… ${Math.round(analyzingFile * 100)}%` : 'Use my audio file'}
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAudioFile(file);
              e.target.value = '';
            }}
          />
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-white/60 select-none" title="Export without the dark background">
          <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} className="accent-white" />
          Transparent
        </label>
        <button
          disabled={exporting}
          onClick={() => onExport('png', transparent)}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:opacity-40"
        >
          Export PNG
        </button>
        <button
          disabled={exporting}
          onClick={() => onExport('svg', transparent)}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:opacity-40"
        >
          Export SVG
        </button>
      </div>
    </div>
  );
}
