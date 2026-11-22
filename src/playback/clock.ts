import { clamp } from '../lib/random';

/**
 * High-frequency playback clock. Spotify only reports position on state events
 * (and when polled), so between reports we extrapolate with performance.now().
 * Small drift is corrected by nudging the clock's rate rather than jumping,
 * which keeps rotation smooth; large drift (seeks, buffering) snaps instantly.
 */
export class PlaybackClock {
  private basePos = 0;
  private baseTime = performance.now();
  private playing = false;
  private rate = 1;
  private rateUntil = 0;
  durationMs = 0;

  static readonly SNAP_THRESHOLD_MS = 250;

  nowMs(at = performance.now()): number {
    if (!this.playing) return this.basePos;
    let elapsed: number;
    if (at <= this.rateUntil) {
      elapsed = (at - this.baseTime) * this.rate;
    } else {
      // Corrective rate applied only until rateUntil, normal speed after that.
      const corrected = Math.max(0, this.rateUntil - this.baseTime) * this.rate;
      elapsed = corrected + (at - Math.max(this.baseTime, this.rateUntil));
    }
    const pos = this.basePos + elapsed;
    return this.durationMs > 0 ? clamp(pos, 0, this.durationMs) : Math.max(0, pos);
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /** Hard set — used for local seeks, play/pause and track loads. */
  set(positionMs: number, playing: boolean): void {
    this.basePos = Math.max(0, positionMs);
    this.baseTime = performance.now();
    this.playing = playing;
    this.rate = 1;
    this.rateUntil = 0;
  }

  /** Soft sync with an authoritative report from the player. */
  sync(positionMs: number, playing: boolean): void {
    const now = performance.now();
    const current = this.nowMs(now);
    const drift = positionMs - current;
    if (!playing || !this.playing || Math.abs(drift) > PlaybackClock.SNAP_THRESHOLD_MS) {
      this.set(positionMs, playing);
      return;
    }
    // Close the drift over ~1s by running slightly fast or slow.
    const window = 1000;
    this.basePos = current;
    this.baseTime = now;
    this.rate = clamp(1 + drift / window, 0.75, 1.25);
    this.rateUntil = now + window;
  }
}
