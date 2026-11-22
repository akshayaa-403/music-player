import { useState } from 'react';

export type SessionState =
  | { status: 'checking' }
  | { status: 'unconfigured' }
  | { status: 'logged-out' }
  | { status: 'logged-in'; name: string; premium: boolean; audio: 'connecting' | 'ready' | 'unavailable' };

interface Props {
  session: SessionState;
  loading: boolean;
  loadingLabel?: string | null;
  onLogin(): void;
  onLogout(): void;
  onLoad(link: string): void;
  onDemo(): void;
}

function StatusPill({ session }: { session: SessionState }) {
  let dot = 'bg-white/30';
  let text = 'Checking…';
  if (session.status === 'unconfigured') {
    dot = 'bg-amber-400';
    text = 'Spotify not configured';
  } else if (session.status === 'logged-out') {
    text = 'Not connected';
  } else if (session.status === 'logged-in') {
    if (session.audio === 'ready') {
      dot = 'bg-spotify';
      text = `${session.name} · in-browser audio`;
    } else if (session.audio === 'connecting') {
      dot = 'bg-spotify animate-pulse';
      text = `${session.name} · connecting player…`;
    } else {
      dot = 'bg-amber-400';
      text = `${session.name} · visual-only${session.premium ? '' : ' (Premium needed for audio)'}`;
    }
  }
  return (
    <span className="flex min-w-0 items-center gap-2 truncate rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 max-sm:hidden">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{text}</span>
    </span>
  );
}

export function Header({ session, loading, loadingLabel, onLogin, onLogout, onLoad, onDemo }: Props) {
  const [link, setLink] = useState('');
  const loggedIn = session.status === 'logged-in';

  return (
    <header className="glass relative z-30 m-3 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 md:flex-nowrap">
      <div className="flex shrink-0 items-center gap-2">
        <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
          <circle cx="16" cy="16" r="13" fill="none" stroke="#f59e0b" strokeWidth="1.6" />
          <circle cx="16" cy="16" r="8.5" fill="none" stroke="#22d3ee" strokeWidth="1.6" />
          <circle cx="16" cy="16" r="3" fill="#a78bfa" />
        </svg>
        <h1 className="text-sm font-semibold tracking-wide text-white">Harmonic Mandala</h1>
      </div>

      <form
        className="order-3 flex w-full min-w-0 items-center gap-2 md:order-none md:mx-4 md:flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          onLoad(link);
        }}
      >
        <label htmlFor="track-link" className="sr-only">
          Spotify track link
        </label>
        <input
          id="track-link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder={loggedIn ? 'Paste a Spotify track link — open.spotify.com/track/… or spotify:track:…' : 'Log in with Spotify, then paste a track link'}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={loading || !loggedIn}
          className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (loadingLabel ?? 'Loading…') : 'Load'}
        </button>
      </form>

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <StatusPill session={session} />
        <button
          onClick={onDemo}
          className="shrink-0 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10"
        >
          Demo
        </button>
        {session.status === 'logged-out' && (
          <button
            onClick={onLogin}
            className="shrink-0 rounded-xl bg-spotify px-3 py-1.5 text-xs font-semibold text-black transition hover:brightness-110"
          >
            Log in with Spotify
          </button>
        )}
        {loggedIn && (
          <button onClick={onLogout} className="shrink-0 px-2 py-1.5 text-xs text-white/50 hover:text-white">
            Log out
          </button>
        )}
      </div>
    </header>
  );
}
