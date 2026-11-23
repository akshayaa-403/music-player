import { forwardRef } from 'react';
import type { SessionState } from './Header';
import { PauseIcon, PlayIcon, SpotifyIcon } from './icons';

interface Props {
  session: SessionState;
  /** A track opened via a shared link is waiting for login. */
  pendingTrack: boolean;
  redirectUri: string;
  onLogin(): void;
  onDemo(): void;
  onFocusLink(): void;
  /** The landing animation can be paused (WCAG 2.2.2). */
  idlePaused: boolean;
  onToggleIdle(): void;
}

/** Empty state: what this is, and the single most useful next step. */
export const Onboarding = forwardRef<HTMLDivElement, Props>(function Onboarding(
  { session, pendingTrack, redirectUri, onLogin, onDemo, onFocusLink, idlePaused, onToggleIdle },
  ref,
) {
  const s = session.status;
  return (
    <div ref={ref} className="chrome chrome-bottom safe-x pointer-events-none absolute inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-20 flex justify-center">
      <section className="glass fade-in pointer-events-auto relative w-full max-w-lg rounded-2xl px-5 py-5 text-center sm:px-6" aria-labelledby="onboarding-title">
        <button
          onClick={onToggleIdle}
          className="icon-btn absolute top-2 right-2 h-8 w-8 text-white/40"
          aria-label={idlePaused ? 'Play background animation' : 'Pause background animation'}
          title={idlePaused ? 'Play background animation' : 'Pause background animation'}
        >
          {idlePaused ? <PlayIcon size={13} /> : <PauseIcon size={13} />}
        </button>
        <h2 id="onboarding-title" className="text-lg font-semibold text-white">
          {pendingTrack && s === 'logged-out' ? 'Log in to open the shared song' : 'See the chakras of a song'}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-white/60">
          Seven rings, Root to Crown. Each listens for its note, its Solfeggio frequency and its kind of sound, and lights
          up in its colour when that part of the music plays. Switch to <strong className="font-medium text-white/80">Waves</strong>{' '}
          to see the same seven functions unrolled.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {s === 'logged-out' && (
            <button onClick={onLogin} className="btn-spotify">
              <SpotifyIcon size={16} /> Log in with Spotify
            </button>
          )}
          {s === 'logged-in' && (
            <button onClick={onFocusLink} className="btn-primary">
              Paste a track link
            </button>
          )}
          <button onClick={onDemo} className={s === 'logged-out' || s === 'logged-in' ? 'btn-secondary' : 'btn-primary'}>
            <PlayIcon size={13} /> Try the demo
          </button>
        </div>

        <p className="mt-3 text-xs text-white/40">
          {s === 'logged-out' && 'Spotify Premium plays audio in this tab; free accounts get the visuals in sync, silently.'}
          {s === 'logged-in' && 'Copy a link from Spotify (Share → Copy song link) and paste it above.'}
          {s === 'checking' && 'Checking your Spotify session…'}
          {s === 'unconfigured' &&
            (import.meta.env.DEV ? (
              <span className="text-amber-200/80">
                Dev: set <code className="code">VITE_SPOTIFY_CLIENT_ID</code> in <code className="code">.env</code> and register{' '}
                <code className="code">{redirectUri}</code> as a redirect URI to enable Spotify.
              </span>
            ) : (
              'Spotify login isn’t enabled on this site yet, but the demo shows everything except audio.'
            ))}
        </p>
        <p className="mt-2 text-[11px] text-white/30 max-sm:hidden">
          Press <kbd className="kbd">?</kbd> for shortcuts · <kbd className="kbd">M</kbd> switches views
        </p>
      </section>
    </div>
  );
});
