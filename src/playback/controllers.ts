import { PlaybackClock } from './clock';
import { startPlayback, type TrackMeta } from '../spotify/api';
import { getAccessToken } from '../spotify/auth';
import { loadSpotifySdk, type SpotifyPlayer } from '../spotify/sdk';

export type ControllerKind = 'spotify' | 'silent';

export interface PlaybackController {
  readonly kind: ControllerKind;
  readonly clock: PlaybackClock;
  load(track: TrackMeta): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(ms: number): Promise<void>;
  /** 0..1. Only controllers that make sound implement it. */
  setVolume?(volume: number): Promise<void>;
  readonly volume?: number;
  destroy(): void;
}

const VOLUME_KEY = 'hm.volume';
function storedVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8;
  } catch {
    return 0.8;
  }
}

/**
 * Clock-only playback: the mandala animates in real time without audio.
 * Used for the demo and for accounts without Spotify Premium.
 */
export class SilentController implements PlaybackController {
  readonly kind = 'silent' as const;
  readonly clock = new PlaybackClock();
  private timer = 0;

  constructor() {
    this.start();
  }

  /** (Re)starts the end-of-track watcher. Safe to call repeatedly (React StrictMode re-runs effects). */
  start() {
    this.stop();
    // Stop at the end of the track like a real player would.
    this.timer = window.setInterval(() => {
      if (this.clock.isPlaying() && this.clock.durationMs > 0 && this.clock.nowMs() >= this.clock.durationMs) {
        this.clock.set(this.clock.durationMs, false);
      }
    }, 200);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
  }
  async load(track: TrackMeta) {
    this.clock.durationMs = track.durationMs;
    this.clock.set(0, false);
  }
  async play() {
    const pos = this.clock.nowMs();
    this.clock.set(pos >= this.clock.durationMs ? 0 : pos, true);
  }
  async pause() {
    this.clock.set(this.clock.nowMs(), false);
  }
  async seek(ms: number) {
    this.clock.set(ms, this.clock.isPlaying());
  }
  destroy() {
    this.stop();
  }
}

export interface SpotifyControllerEvents {
  onError(message: string, fatal: boolean): void;
}

/** In-browser audio via the Spotify Web Playback SDK (Premium only). */
export class SpotifyController implements PlaybackController {
  readonly kind = 'spotify' as const;
  readonly clock = new PlaybackClock();
  private player: SpotifyPlayer | null = null;
  private deviceId: string | null = null;
  private deviceReady: Promise<string>;
  private resolveDevice!: (id: string) => void;
  private rejectDevice!: (e: Error) => void;
  private track: TrackMeta | null = null;
  private startedUri: string | null = null;
  private pollTimer = 0;
  private destroyed = false;
  volume = storedVolume();

  constructor(private readonly events: SpotifyControllerEvents) {
    this.deviceReady = new Promise((res, rej) => {
      this.resolveDevice = res;
      this.rejectDevice = rej;
    });
    this.deviceReady.catch(() => {}); // surfaced via events
  }

  async init(): Promise<void> {
    const Spotify = await loadSpotifySdk();
    if (this.destroyed) return;
    const player = new Spotify.Player({
      name: 'Harmonic Mandala',
      volume: this.volume,
      getOAuthToken: (cb) => {
        void getAccessToken().then((t) => t && cb(t));
      },
    });
    this.player = player;

    player.addListener('ready', ({ device_id }) => {
      this.deviceId = device_id;
      this.resolveDevice(device_id);
    });
    player.addListener('not_ready', () => {
      this.deviceId = null;
    });
    player.addListener('player_state_changed', (state) => {
      if (!state) return;
      // Ignore events for other tracks (e.g. playback hijacked from another device).
      if (this.startedUri && state.track_window.current_track.uri !== this.startedUri) return;
      this.syncFrom(state.position, state.paused, state.timestamp);
    });
    const fail = (fatal: boolean, prefix: string) => (e: { message: string }) => {
      const msg = `${prefix}${e.message}`;
      if (fatal) this.rejectDevice(new Error(msg));
      this.events.onError(msg, fatal);
    };
    player.addListener('initialization_error', fail(true, 'Spotify player failed to start: '));
    player.addListener('authentication_error', fail(true, 'Spotify authentication error: '));
    player.addListener('account_error', fail(true, 'Spotify Premium is required for in-browser playback. '));
    player.addListener('playback_error', fail(false, 'Playback error: '));
    player.addListener('autoplay_failed', () =>
      this.events.onError('The browser blocked autoplay — press play to start.', false),
    );

    const ok = await player.connect();
    if (!ok) {
      const err = new Error('Could not connect the Spotify player.');
      this.rejectDevice(err);
      throw err;
    }

    // Poll while playing so the interpolated clock never drifts far.
    this.pollTimer = window.setInterval(async () => {
      if (!this.clock.isPlaying() || !this.player) return;
      const s = await this.player.getCurrentState();
      if (s && (!this.startedUri || s.track_window.current_track.uri === this.startedUri)) {
        this.syncFrom(s.position, s.paused, s.timestamp);
      }
    }, 1000);
  }

  private syncFrom(position: number, paused: boolean, timestamp: number) {
    // `position` was true at `timestamp` (epoch ms); account for delivery latency.
    const latency = paused || !timestamp ? 0 : Math.max(0, Math.min(1000, Date.now() - timestamp));
    this.clock.sync(position + latency, !paused);
  }

  async load(track: TrackMeta) {
    this.track = track;
    this.startedUri = null;
    this.clock.durationMs = track.durationMs;
    this.clock.set(0, false);
  }

  async play() {
    if (!this.player || !this.track) return;
    // Must run inside the user gesture on some browsers (Safari / mobile).
    await this.player.activateElement().catch(() => {});
    if (this.startedUri !== this.track.uri) {
      const deviceId = this.deviceId ?? (await this.deviceReady);
      const pos = this.clock.nowMs();
      await startPlayback(deviceId, this.track.uri, pos >= this.track.durationMs ? 0 : pos);
      this.startedUri = this.track.uri;
      this.clock.set(pos, true);
      return;
    }
    this.clock.set(this.clock.nowMs(), true);
    await this.player.resume();
  }

  async pause() {
    this.clock.set(this.clock.nowMs(), false);
    if (this.player && this.startedUri) await this.player.pause();
  }

  async seek(ms: number) {
    this.clock.set(ms, this.clock.isPlaying());
    if (this.player && this.startedUri) await this.player.seek(Math.round(ms));
  }

  async setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      /* storage unavailable: volume just won't persist */
    }
    await this.player?.setVolume(this.volume);
  }

  destroy() {
    this.destroyed = true;
    clearInterval(this.pollTimer);
    this.player?.disconnect();
    this.player = null;
  }
}
