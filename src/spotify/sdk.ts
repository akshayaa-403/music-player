/** Minimal typings for the Spotify Web Playback SDK surface we use. */
export interface WebPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  timestamp: number;
  track_window: { current_track: { id: string | null; uri: string } };
}

export interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: 'ready' | 'not_ready', cb: (d: { device_id: string }) => void): boolean;
  addListener(event: 'player_state_changed', cb: (s: WebPlaybackState | null) => void): boolean;
  addListener(
    event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error' | 'autoplay_failed',
    cb: (e: { message: string }) => void,
  ): boolean;
  getCurrentState(): Promise<WebPlaybackState | null>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  activateElement(): Promise<void>;
  setVolume(volume: number): Promise<void>;
}

interface SpotifyNamespace {
  Player: new (opts: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SpotifyPlayer;
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: SpotifyNamespace;
  }
}

let loading: Promise<SpotifyNamespace> | null = null;

export function loadSpotifySdk(): Promise<SpotifyNamespace> {
  if (window.Spotify) return Promise.resolve(window.Spotify);
  loading ??= new Promise((resolve, reject) => {
    // The SDK calls this global once it has booted; it must exist before the script loads.
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify!);
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load the Spotify Web Playback SDK (blocked by an extension or offline?).'));
    };
    document.body.appendChild(script);
  });
  return loading;
}
