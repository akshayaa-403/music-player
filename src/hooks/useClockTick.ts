import { useEffect, useReducer } from 'react';
import type { PlaybackClock } from '../playback/clock';

/**
 * Re-renders the calling component at `fps` and returns the clock's position.
 * UI (scrubber, inspector numbers) doesn't need 60fps; the canvas has its own loop.
 */
export function useClockTick(clock: PlaybackClock | null, fps = 12): { ms: number; playing: boolean } {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!clock) return;
    let id = 0;
    let last = 0;
    const loop = (now: number) => {
      if (now - last >= 1000 / fps) {
        last = now;
        force();
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [clock, fps]);
  return { ms: clock?.nowMs() ?? 0, playing: clock?.isPlaying() ?? false };
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
