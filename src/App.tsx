import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header, type SessionState } from './components/Header';
import { Inspector } from './components/Inspector';
import { MandalaCanvas } from './components/MandalaCanvas';
import { RingLegend } from './components/RingLegend';
import { TransportBar } from './components/TransportBar';
import { defaultProviders, derivedFeatures, resolveFeatures } from './features/resolve';
import type { ResolvedFeatures } from './features/types';
import { exportPng, exportSvg } from './mandala/export';
import { buildRings } from './mandala/rings';
import { analyzeOwnFile, buildChakraMap, estimateChakraMap, type ChakraMap } from './chakra';
import { SilentController, SpotifyController, type PlaybackController } from './playback/controllers';
import { getProfile, getTrack, SpotifyApiError, type TrackMeta } from './spotify/api';
import { beginLogin, completeLoginIfRedirect, hasSession, isAuthConfigured, logout, redirectUri } from './spotify/auth';
import { parseTrackLink } from './spotify/parseTrackLink';

const DEMO_TRACK: TrackMeta = {
  id: 'demoHarmonicMandala000',
  uri: 'demo:track',
  name: 'Sacred Geometry (demo)',
  artists: ['Harmonic Mandala'],
  album: '',
  albumArt: null,
  durationMs: 214_000,
  isrc: null,
  popularity: 64,
};
const DEMO_FEATURES = derivedFeatures(DEMO_TRACK);
const DEMO_CHAKRA = estimateChakraMap(DEMO_FEATURES);

interface Loaded {
  track: TrackMeta;
  features: ResolvedFeatures;
  chakra: ChakraMap;
  isDemo: boolean;
}

export default function App() {
  const [session, setSession] = useState<SessionState>({ status: 'checking' });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [analyzingFile, setAnalyzingFile] = useState<number | null>(null);

  // Silent controller always exists (demo / no-Premium); Spotify one when available.
  const silent = useMemo(() => new SilentController(), []);
  const [spotifyCtl, setSpotifyCtl] = useState<SpotifyController | null>(null);
  const controller: PlaybackController = loaded && !loaded.isDemo && spotifyCtl ? spotifyCtl : silent;
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  useEffect(() => () => silent.destroy(), [silent]);

  const connectPlayer = useCallback(async () => {
    const ctl = new SpotifyController({
      onError(message, fatal) {
        setNotice(message);
        if (fatal) {
          ctl.destroy();
          setSpotifyCtl(null);
          setSession((s) => (s.status === 'logged-in' ? { ...s, audio: 'unavailable' } : s));
        }
      },
    });
    try {
      await ctl.init();
      setSpotifyCtl(ctl);
      setSession((s) => (s.status === 'logged-in' ? { ...s, audio: 'ready' } : s));
    } catch (e) {
      ctl.destroy();
      setNotice(e instanceof Error ? e.message : 'Spotify player unavailable.');
      setSession((s) => (s.status === 'logged-in' ? { ...s, audio: 'unavailable' } : s));
    }
  }, []);

  // Boot: finish an OAuth redirect if present, then restore the session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isAuthConfigured()) {
        setSession({ status: 'unconfigured' });
        return;
      }
      const loginError = await completeLoginIfRedirect();
      if (loginError) setError(loginError);
      if (!hasSession()) {
        setSession({ status: 'logged-out' });
        return;
      }
      try {
        const profile = await getProfile();
        if (cancelled) return;
        const premium = profile.product === 'premium';
        setSession({ status: 'logged-in', name: profile.displayName, premium, audio: premium ? 'connecting' : 'unavailable' });
        if (premium) void connectPlayer();
        else setNotice('Your Spotify account isn’t Premium, so audio can’t play in the browser. Mandalas still animate in visual-only mode.');
      } catch (e) {
        if (cancelled) return;
        if (e instanceof SpotifyApiError && e.status === 403) {
          setError('Spotify refused access. If the app is in Development Mode, add your account under User Management in the Spotify dashboard.');
        } else setError(e instanceof Error ? e.message : 'Could not reach Spotify.');
        logout();
        setSession({ status: 'logged-out' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectPlayer]);

  useEffect(() => () => spotifyCtl?.destroy(), [spotifyCtl]);

  // If the active controller changes under a loaded track (e.g. the Spotify player
  // failed fatally and we fell back to visual-only), give it the track.
  useEffect(() => {
    if (loaded && controller.clock.durationMs !== loaded.track.durationMs) void controller.load(loaded.track);
  }, [controller, loaded]);

  const switchTo = useCallback(
    async (next: Loaded) => {
      await controllerRef.current.pause().catch(() => {});
      const target = !next.isDemo && spotifyCtl ? spotifyCtl : silent;
      await target.load(next.track);
      setSelectedId(null);
      setHoverId(null);
      setLoaded(next);
    },
    [silent, spotifyCtl],
  );

  const loadLink = async (link: string) => {
    setError(null);
    const parsed = parseTrackLink(link);
    if (!parsed.ok) return setError(parsed.error);
    if (session.status !== 'logged-in') return setError('Log in with Spotify to load tracks.');
    setLoading(true);
    try {
      const track = await getTrack(parsed.id);
      const features = await resolveFeatures(track, defaultProviders({ spotify: true }));
      // Map the song's chakras first, then draw.
      const chakra = await buildChakraMap(track, features, setLoadingLabel);
      await switchTo({ track, features, chakra, isDemo: false });
    } catch (e) {
      if (e instanceof SpotifyApiError && e.status === 401) {
        logout();
        setSession({ status: 'logged-out' });
        setError('Your Spotify session expired — please log in again.');
      } else setError(e instanceof Error ? e.message : 'Could not load that track.');
    } finally {
      setLoading(false);
      setLoadingLabel(null);
    }
  };

  const loadDemo = () => {
    setError(null);
    void switchTo({ track: DEMO_TRACK, features: DEMO_FEATURES, chakra: DEMO_CHAKRA, isDemo: true });
  };

  /** Full-song, second-by-second analysis from the user's own copy of the song. */
  const handleOwnFile = async (file: File) => {
    if (!loaded) return;
    setError(null);
    setAnalyzingFile(0);
    try {
      const chakra = await analyzeOwnFile(file, setAnalyzingFile);
      if (chakra.timeline && Math.abs(chakra.timeline.frames * chakra.timeline.hop * 1000 - loaded.track.durationMs) > 15_000) {
        setNotice('That file’s length doesn’t match this song, so the colours may be out of sync.');
      }
      setLoaded((l) => (l && l.track.id === loaded.track.id ? { ...l, chakra } : l));
    } catch {
      setError('Couldn’t read that audio file. Try an MP3, M4A or WAV.');
    } finally {
      setAnalyzingFile(null);
    }
  };

  // `/?demo` (optionally `&t=<seconds>`) opens straight into the demo — handy for sharing and screenshots.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.has('demo')) return;
    void switchTo({ track: DEMO_TRACK, features: DEMO_FEATURES, chakra: DEMO_CHAKRA, isDemo: true }).then(() => {
      const t = Number(q.get('t'));
      if (t > 0) void silent.seek(t * 1000);
      if (q.has('select')) setSelectedId(q.get('select'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback(async () => {
    const ctl = controllerRef.current;
    try {
      if (ctl.clock.isPlaying()) await ctl.pause();
      else await ctl.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Playback failed.');
    }
  }, []);

  const seek = async (ms: number) => {
    try {
      await controllerRef.current.seek(ms);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Seek failed.');
    }
  };

  // Space = play/pause, Esc = close inspector.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, button, [contenteditable]')) return;
      if (e.code === 'Space' && loaded) {
        e.preventDefault();
        void toggle();
      } else if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loaded, toggle]);

  const features = loaded?.features ?? DEMO_FEATURES;
  const track = loaded?.track ?? DEMO_TRACK;
  const chakra = loaded?.chakra ?? DEMO_CHAKRA;
  const rings = useMemo(() => buildRings(features, chakra, track.durationMs / 1000), [features, chakra, track]);
  const selectedRing = rings.find((r) => r.id === selectedId) ?? null;

  const doExport = async (kind: 'png' | 'svg', transparent: boolean) => {
    if (!loaded) return;
    setExporting(true);
    try {
      const input = { rings, features, track, t: controller.clock.nowMs() / 1000, transparent };
      if (kind === 'svg') exportSvg(input);
      else await exportPng(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      <MandalaCanvas
        rings={rings}
        features={features}
        durationMs={track.durationMs}
        clock={loaded ? controller.clock : null}
        interactive={!!loaded}
        hoverId={hoverId}
        selectedId={selectedId}
        onHover={setHoverId}
        onSelect={setSelectedId}
      />

      <Header
        session={session}
        loading={loading}
        loadingLabel={loadingLabel}
        onLogin={() => beginLogin().catch((e) => setError(e.message))}
        onLogout={() => {
          logout();
          spotifyCtl?.destroy();
          setSpotifyCtl(null);
          setSession({ status: 'logged-out' });
          if (loaded && !loaded.isDemo) setLoaded(null);
        }}
        onLoad={loadLink}
        onDemo={loadDemo}
      />

      {(error || notice) && (
        <div className="absolute top-[84px] left-1/2 z-40 flex w-[min(640px,calc(100%-24px))] -translate-x-1/2 flex-col gap-2 max-md:top-[132px]">
          {error && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-950/80 px-4 py-2.5 text-sm text-rose-100">
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-rose-200/60 hover:text-white" aria-label="Dismiss error">✕</button>
            </div>
          )}
          {notice && (
            <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-300/25 bg-amber-950/70 px-4 py-2.5 text-sm text-amber-100">
              <span className="flex-1">{notice}</span>
              <button onClick={() => setNotice(null)} className="text-amber-200/60 hover:text-white" aria-label="Dismiss notice">✕</button>
            </div>
          )}
        </div>
      )}

      {!loaded && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 z-10 flex justify-center px-4">
          <div className="glass pointer-events-auto max-w-lg rounded-2xl px-6 py-5 text-center">
            <h2 className="text-lg font-semibold text-white">See the chakras of a song</h2>
            <p className="mt-1.5 text-sm text-white/60">
              Seven rings, Root to Crown. Each one listens for its note, its frequency and its kind of sound, and lights
              up in its colour when that part of the music plays.
            </p>
            {session.status === 'unconfigured' ? (
              <p className="mt-3 text-xs text-amber-200/80">
                Set <code className="rounded bg-white/10 px-1">VITE_SPOTIFY_CLIENT_ID</code> in <code className="rounded bg-white/10 px-1">.env</code> and
                register <code className="rounded bg-white/10 px-1">{redirectUri()}</code> as a redirect URI to enable Spotify. Meanwhile, try the demo.
              </p>
            ) : (
              <p className="mt-3 text-xs text-white/45">
                {session.status === 'logged-in' ? 'Paste a Spotify track link above.' : 'Log in with Spotify (Premium for audio), or try the silent demo.'}
              </p>
            )}
            <button onClick={loadDemo} className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/85">
              Try the demo
            </button>
          </div>
        </div>
      )}

      {loaded && (
        <>
          <RingLegend
            rings={rings}
            hoverId={hoverId}
            selectedId={selectedId}
            onHover={setHoverId}
            onSelect={setSelectedId}
            sourceSummary={chakra.sourceLabel}
          />
          {selectedRing && <Inspector ring={selectedRing} clock={controller.clock} onClose={() => setSelectedId(null)} />}
          <TransportBar
            track={track}
            controller={controller}
            isDemo={loaded.isDemo}
            onToggle={toggle}
            onSeek={seek}
            onExport={doExport}
            exporting={exporting}
            onAudioFile={handleOwnFile}
            analyzingFile={analyzingFile}
          />
        </>
      )}
    </div>
  );
}
