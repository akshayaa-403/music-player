import { forwardRef, useEffect, useRef, useState } from 'react';
import type { Section } from '../features/types';
import { formatTime, useClockTick } from '../hooks/useClockTick';
import type { ViewMode } from '../lib/url';
import type { PlaybackController } from '../playback/controllers';
import type { TrackMeta } from '../spotify/api';
import {
  BackIcon,
  CollapseIcon,
  DownloadIcon,
  ExpandIcon,
  EyeOffIcon,
  ForwardIcon,
  LinkIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
  SpinnerIcon,
  VolumeIcon,
  WaveFileIcon,
} from './icons';
import { Menu } from './Menu';

interface Props {
  track: TrackMeta;
  controller: PlaybackController;
  isDemo: boolean;
  view: ViewMode;
  sections: Section[];
  onToggle(): void;
  onSeek(ms: number): void;
  onExport(kind: 'png' | 'svg', transparent: boolean): void;
  exporting: boolean;
  onAudioFile(file: File): void;
  /** 0..1 while analysing a file, null otherwise. */
  analyzingFile: number | null;
  onShare(): void;
  onHideUi(): void;
  fullscreen: boolean;
  canFullscreen: boolean;
  onToggleFullscreen(): void;
  onDemo(): void;
}

const SKIP_MS = 10_000;

export const TransportBar = forwardRef<HTMLDivElement, Props>(function TransportBar(
  {
    track,
    controller,
    isDemo,
    view,
    sections,
    onToggle,
    onSeek,
    onExport,
    exporting,
    onAudioFile,
    analyzingFile,
    onShare,
    onHideUi,
    fullscreen,
    canFullscreen,
    onToggleFullscreen,
    onDemo,
  },
  ref,
) {
  const { ms, playing } = useClockTick(controller.clock, 15);
  const [drag, setDrag] = useState<number | null>(null);
  const [hoverMs, setHoverMs] = useState<{ ms: number; x: number } | null>(null);
  const [transparent, setTransparent] = useState(false);
  const [volume, setVolume] = useState(controller.volume ?? 0.8);
  const [lastVolume, setLastVolume] = useState(0.8);
  const fileRef = useRef<HTMLInputElement>(null);
  // The controller changes when the Spotify player connects or drops; show its volume, not a stale one.
  useEffect(() => {
    setVolume(controller.volume ?? 0.8);
  }, [controller]);
  const shown = drag ?? ms;
  const dur = track.durationMs;
  const fill = dur > 0 ? (shown / dur) * 100 : 0;
  const hasAudio = controller.kind === 'spotify' && !!controller.setVolume;

  const commit = () => {
    if (drag !== null) onSeek(drag);
    setDrag(null);
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    if (v > 0) setLastVolume(v);
    void controller.setVolume?.(v);
  };

  const viewName = view === 'waves' ? 'waves' : 'mandala';

  return (
    <div ref={ref} className="chrome chrome-bottom safe-x absolute inset-x-0 bottom-0 z-30 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="glass mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-3 py-2.5 sm:px-4 md:flex-nowrap md:py-3">
        {/* Track */}
        <div className="flex min-w-0 flex-1 items-center gap-3 md:w-60 md:flex-none">
          {track.albumArt ? (
            <img src={track.albumArt} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover shadow-lg shadow-black/40" />
          ) : (
            <div className="h-11 w-11 shrink-0 rounded-md bg-gradient-to-br from-rose-500 via-amber-400 to-violet-500" aria-hidden />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white" title={track.name}>
              {track.name}
            </div>
            <div className="truncate text-xs text-white/55" title={track.artists.join(', ')}>
              {track.artists.join(', ')}
              {isDemo ? (
                <span className="text-amber-300/80"> · silent demo</span>
              ) : controller.kind === 'silent' ? (
                <span className="text-amber-300/80"> · visual only</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Play controls (compact on phones) */}
        <div className="flex shrink-0 items-center gap-1 md:order-none">
          <button onClick={() => onSeek(Math.max(0, ms - SKIP_MS))} className="icon-btn max-sm:hidden" aria-label="Back 10 seconds" title="Back 10 s (←)">
            <BackIcon size={17} />
          </button>
          <button
            onClick={onToggle}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-black shadow-lg shadow-white/10 transition hover:scale-105 active:scale-95"
            aria-label={playing ? 'Pause' : 'Play'}
            title={`${playing ? 'Pause' : 'Play'} (Space)`}
          >
            {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} className="ml-0.5" />}
          </button>
          <button onClick={() => onSeek(Math.min(dur, ms + SKIP_MS))} className="icon-btn max-sm:hidden" aria-label="Forward 10 seconds" title="Forward 10 s (→)">
            <ForwardIcon size={17} />
          </button>
        </div>

        {/* Scrubber */}
        <div className="order-last flex min-w-0 basis-full items-center gap-3 md:order-none md:flex-1 md:basis-auto">
          <span className="w-10 shrink-0 text-right font-mono text-xs text-white/60 tabular-nums">{formatTime(shown)}</span>
          <div
            className="relative min-w-0 flex-1"
            onPointerMove={(e) => {
              if (e.pointerType === 'touch') return;
              const r = e.currentTarget.getBoundingClientRect();
              const u = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
              setHoverMs({ ms: u * dur, x: u * r.width });
            }}
            onPointerLeave={() => setHoverMs(null)}
          >
            {/* Section boundaries */}
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0" aria-hidden>
              {dur > 0 &&
                sections.slice(1).map((s) => (
                  <span key={s.start} className="absolute -top-[5px] h-[10px] w-px bg-white/30" style={{ left: `${(s.start * 1000 * 100) / dur}%` }} />
                ))}
            </div>
            <input
              type="range"
              className="scrub relative w-full"
              min={0}
              max={dur}
              step={250}
              value={shown}
              style={{ '--fill': `${fill}%` } as React.CSSProperties}
              onChange={(e) => setDrag(Number(e.target.value))}
              onPointerUp={commit}
              onKeyUp={commit}
              onBlur={commit}
              aria-label="Seek"
              aria-valuetext={`${formatTime(shown)} of ${formatTime(dur)}`}
            />
            {hoverMs && (
              <span
                className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-black/80 px-1.5 py-0.5 font-mono text-[10px] text-white/90 tabular-nums"
                style={{ left: hoverMs.x }}
                aria-hidden
              >
                {formatTime(hoverMs.ms)}
              </span>
            )}
          </div>
          <span className="w-10 shrink-0 font-mono text-xs text-white/60 tabular-nums">{formatTime(dur)}</span>
        </div>

        {/* Secondary actions */}
        <div className="flex shrink-0 items-center gap-0.5">
          {analyzingFile !== null && (
            <span className="mr-1 flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-white/75" role="status">
              <SpinnerIcon size={12} />
              <span className="max-sm:hidden">Listening…</span> {Math.round(analyzingFile * 100)}%
            </span>
          )}
          {hasAudio && (
            <div className="group flex items-center">
              <button
                onClick={() => changeVolume(volume > 0 ? 0 : lastVolume || 0.8)}
                className="icon-btn"
                aria-label={volume > 0 ? 'Mute' : 'Unmute'}
                title={volume > 0 ? 'Mute' : 'Unmute'}
              >
                <VolumeIcon size={17} level={volume} />
              </button>
              <input
                type="range"
                className="scrub w-20 max-md:hidden"
                min={0}
                max={1}
                step={0.02}
                value={volume}
                style={{ '--fill': `${volume * 100}%` } as React.CSSProperties}
                onChange={(e) => changeVolume(Number(e.target.value))}
                aria-label="Volume"
                aria-valuetext={`${Math.round(volume * 100)}%`}
              />
            </div>
          )}
          {canFullscreen && (
            <button onClick={onToggleFullscreen} className="icon-btn max-sm:hidden" aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} title={`${fullscreen ? 'Exit full screen' : 'Full screen'} (F)`}>
              {fullscreen ? <CollapseIcon size={17} /> : <ExpandIcon size={17} />}
            </button>
          )}
          <button onClick={onHideUi} className="icon-btn max-sm:hidden" aria-label="Hide interface" title="Hide interface (H)">
            <EyeOffIcon size={17} />
          </button>
          <Menu
            label="More actions"
            triggerClassName="icon-btn"
            trigger={<MoreIcon size={18} />}
            items={[
              {
                label: analyzingFile !== null ? 'Listening to your file…' : 'Analyze my audio file…',
                icon: <WaveFileIcon size={15} />,
                disabled: analyzingFile !== null,
                onSelect: () => fileRef.current?.click(),
              },
              { kind: 'separator' },
              { label: `Export ${viewName} as PNG`, icon: <DownloadIcon size={15} />, disabled: exporting, onSelect: () => onExport('png', transparent) },
              { label: `Export ${viewName} as SVG`, icon: <DownloadIcon size={15} />, disabled: exporting, onSelect: () => onExport('svg', transparent) },
              { kind: 'toggle', label: 'Transparent background', checked: transparent, onToggle: setTransparent },
              { kind: 'separator' },
              { label: 'Copy link to this moment', icon: <LinkIcon size={15} />, onSelect: onShare },
              ...(canFullscreen ? [{ label: fullscreen ? 'Exit full screen' : 'Full screen', hint: 'F', icon: fullscreen ? <CollapseIcon size={15} /> : <ExpandIcon size={15} />, onSelect: onToggleFullscreen }] : []),
              { label: 'Hide interface', hint: 'H', icon: <EyeOffIcon size={15} />, onSelect: onHideUi },
              ...(isDemo ? [] : [{ kind: 'separator' as const }, { label: 'Open the demo', icon: <PlayIcon size={13} />, onSelect: onDemo }]),
            ]}
          />
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAudioFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </div>
  );
});
