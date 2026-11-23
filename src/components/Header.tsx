import { forwardRef, useId, useState } from 'react';
import type { ViewMode } from '../lib/url';
import { parseTrackLink } from '../spotify/parseTrackLink';
import { CloseIcon, HelpIcon, SpinnerIcon, SpotifyIcon } from './icons';
import { Menu } from './Menu';
import { ViewSwitch } from './ViewSwitch';

export type SessionState =
  | { status: 'checking' }
  | { status: 'unconfigured' }
  | { status: 'logged-out' }
  | { status: 'logged-in'; name: string; premium: boolean; audio: 'connecting' | 'ready' | 'unavailable' };

interface Props {
  session: SessionState;
  view: ViewMode;
  onViewChange(v: ViewMode): void;
  loading: boolean;
  loadingLabel?: string | null;
  onLogin(): void;
  onLogout(): void;
  /** Called with a validated Spotify track ID. */
  onLoad(trackId: string): void;
  onDemo(): void;
  onHelp(): void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function statusOf(session: SessionState): { dot: string; text: string; long: string } {
  switch (session.status) {
    case 'checking':
      return { dot: 'bg-white/30 animate-pulse', text: 'Connecting…', long: 'Checking your Spotify session' };
    case 'unconfigured':
      return { dot: 'bg-white/30', text: 'Demo mode', long: 'Spotify login isn’t set up on this site' };
    case 'logged-out':
      return { dot: 'bg-white/30', text: 'Not connected', long: 'Not connected to Spotify' };
    case 'logged-in':
      if (session.audio === 'ready') return { dot: 'bg-spotify', text: session.name, long: `${session.name} · audio plays in this tab` };
      if (session.audio === 'connecting') return { dot: 'bg-spotify animate-pulse', text: session.name, long: `${session.name} · connecting the player…` };
      return {
        dot: 'bg-amber-400',
        text: `${session.name} · visual only`,
        long: `${session.name} · visual only${session.premium ? ' (player unavailable)' : ' — Spotify Premium is needed for audio'}`,
      };
  }
}

export const Header = forwardRef<HTMLElement, Props>(function Header(
  { session, view, onViewChange, loading, loadingLabel, onLogin, onLogout, onLoad, onDemo, onHelp, inputRef },
  ref,
) {
  const [link, setLink] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const hintId = useId();
  const loggedIn = session.status === 'logged-in';
  const canLogin = session.status === 'logged-out';
  const status = statusOf(session);

  const submit = (raw: string) => {
    const parsed = parseTrackLink(raw);
    if (!parsed.ok) {
      setProblem(parsed.error);
      return;
    }
    setProblem(null);
    onLoad(parsed.id);
  };

  const placeholder = session.status === 'unconfigured' ? 'Spotify isn’t set up on this site — try the demo' : 'Paste a Spotify track link';

  return (
    <header ref={ref} className="chrome chrome-top safe-x absolute inset-x-0 top-0 z-30 pt-3">
      <div className="glass relative flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-2xl px-3 py-2.5 sm:px-4 md:flex-nowrap">
        {loading && (
          <div className="absolute inset-x-3 top-0 h-0.5 overflow-hidden rounded-full" aria-hidden>
            <div className="progress-indeterminate h-full w-2/5 rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent" />
          </div>
        )}

        <a
          href={import.meta.env.BASE_URL}
          className="flex shrink-0 items-center gap-2 rounded-lg"
          onClick={(e) => {
            e.preventDefault();
            onHelp();
          }}
          title="About Harmonic Mandala"
        >
          <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
            <circle cx="16" cy="16" r="13" fill="none" stroke="#b44dff" strokeWidth="1.6" />
            <circle cx="16" cy="16" r="9" fill="none" stroke="#22b8f0" strokeWidth="1.6" />
            <circle cx="16" cy="16" r="5" fill="none" stroke="#ffd21f" strokeWidth="1.6" />
            <circle cx="16" cy="16" r="2" fill="#ff3b3b" />
          </svg>
          <h1 className="text-sm font-semibold tracking-wide text-white max-sm:sr-only">Harmonic Mandala</h1>
        </a>

        <ViewSwitch view={view} onChange={onViewChange} />

        <form
          className="relative order-3 flex w-full min-w-0 items-center gap-2 md:order-none md:mx-2 md:flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            submit(link);
          }}
          noValidate
        >
          <label htmlFor="track-link" className="sr-only">
            Spotify track link
          </label>
          <div className="relative min-w-0 flex-1">
            <input
              id="track-link"
              ref={inputRef}
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                if (problem) setProblem(null);
              }}
              onPaste={(e) => {
                // Pasting a valid link loads it straight away.
                const text = e.clipboardData.getData('text');
                if (text && parseTrackLink(text).ok && !loading) {
                  e.preventDefault();
                  setLink(text.trim());
                  submit(text);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  if (link) setLink('');
                  else e.currentTarget.blur();
                  setProblem(null);
                }
              }}
              placeholder={placeholder}
              disabled={session.status === 'unconfigured'}
              aria-invalid={!!problem}
              aria-describedby={problem ? hintId : canLogin ? `${hintId}-login` : undefined}
              enterKeyHint="go"
              inputMode="url"
              className={`w-full min-w-0 rounded-xl border bg-black/40 py-2 pr-8 pl-3 text-sm text-white placeholder:text-white/35 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                problem ? 'border-rose-400/60 focus:border-rose-300/80' : 'border-white/10 focus:border-white/35'
              }`}
              autoComplete="off"
              spellCheck={false}
            />
            {link && !loading && (
              <button
                type="button"
                onClick={() => {
                  setLink('');
                  setProblem(null);
                  inputRef.current?.focus();
                }}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1 text-white/40 hover:text-white"
                aria-label="Clear link"
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || session.status === 'unconfigured' || session.status === 'checking'}
            className="btn-primary shrink-0 py-2"
            aria-live="polite"
          >
            {loading ? (
              <>
                <SpinnerIcon size={14} />
                <span className="max-w-40 truncate">{loadingLabel ?? 'Loading…'}</span>
              </>
            ) : loggedIn ? (
              'Load'
            ) : (
              'Open'
            )}
          </button>
          {canLogin && !problem && (
            <span id={`${hintId}-login`} className="sr-only">
              You’ll be asked to log in with Spotify first.
            </span>
          )}
          {problem && (
            <p
              id={hintId}
              role="alert"
              className="toast-in absolute top-full left-0 z-40 mt-2 max-w-full rounded-lg border border-rose-400/30 bg-rose-950/95 px-3 py-1.5 text-xs text-rose-50 shadow-xl"
            >
              {problem}
            </p>
          )}
        </form>

        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          <span
            className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 max-lg:hidden"
            title={status.long}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} aria-hidden />
            <span className="max-w-44 truncate">{status.text}</span>
            <span className="sr-only">{status.long}</span>
          </span>
          <button onClick={onDemo} className="btn-secondary px-3 py-1.5 text-xs max-sm:hidden" title="Play the silent demo song">
            Demo
          </button>
          {canLogin && (
            <button onClick={onLogin} className="btn-spotify px-3 py-1.5 text-xs" aria-label="Log in with Spotify" title="Log in with Spotify">
              <SpotifyIcon size={15} />
              <span className="max-[420px]:hidden" aria-hidden>
                Log in
              </span>
            </button>
          )}
          {loggedIn && (
            <Menu
              label="Account"
              placement="bottom-end"
              triggerClassName="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-bold text-black uppercase"
              trigger={session.name.slice(0, 1)}
              items={[
                { label: status.long, disabled: true, onSelect: () => {} },
                { kind: 'separator' },
                { label: 'Log out', onSelect: onLogout },
              ]}
            />
          )}
          <button onClick={onHelp} className="icon-btn h-8 w-8" aria-label="Help and keyboard shortcuts" title="Help (?)">
            <HelpIcon size={18} />
          </button>
        </div>
      </div>
    </header>
  );
});
