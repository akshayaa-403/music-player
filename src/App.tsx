import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyzeOwnFile, buildChakraMap, estimateChakraMap, type ChakraMap } from './chakra';
import { HelpDialog } from './components/HelpDialog';
import { Header, type SessionState } from './components/Header';
import { Inspector } from './components/Inspector';
import { Onboarding } from './components/Onboarding';
import { RingLegend } from './components/RingLegend';
import { ToastHost, useToasts } from './components/Toasts';
import { TransportBar } from './components/TransportBar';
import { Visualizer } from './components/Visualizer';
import { EyeOffIcon } from './components/icons';
import { defaultProviders, derivedFeatures, resolveFeatures } from './features/resolve';
import type { ResolvedFeatures } from './features/types';
import { useElementHeight } from './hooks/useElementHeight';
import { useMediaQuery } from './hooks/useMediaQuery';
import { buildSearch, readUrlState, replaceSearch, shareUrl, storedView, storeView, type ViewMode } from './lib/url';
import { exportPng, exportSvg } from './mandala/export';
import { buildRings } from './mandala/rings';
import { SilentController, SpotifyController, type PlaybackController } from './playback/controllers';
import { getProfile, getTrack, SpotifyApiError, type TrackMeta } from './spotify/api';
import {
  beginLogin,
  completeLoginIfRedirect,
  hasSession,
  isAuthConfigured,
  logout,
  pendingLoginReturn,
  redirectUri,
} from './spotify/auth';

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

/** A track to open once the session allows it (from a shared link, or pasted while connecting). */
interface PendingLink {
  id: string;
  t: number | null;
  select: string | null;
}

interface OpenOpts {
  t?: number | null;
  select?: string | null;
}

const SEEK_STEP_MS = 5_000;
const SEEK_BIG_STEP_MS = 15_000;
const LEGEND_W = 224 + 12 + 12; // RingLegend width + margin + gap
const INSPECTOR_W = 380 + 12 + 12;
const MEDIA_ACTIONS: MediaSessionAction[] = ['play', 'pause', 'seekbackward', 'seekforward', 'seekto'];

const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function App() {
  // URL state is read once. During an OAuth return it comes from what the user had before logging in.
  const [initialUrl] = useState(() => readUrlState(pendingLoginReturn() ?? window.location.search));

  const [session, setSession] = useState<SessionState>({ status: 'checking' });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [analyzingFile, setAnalyzingFile] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setViewState] = useState<ViewMode>(() => initialUrl.view ?? storedView() ?? 'mandala');
  const [pending, setPending] = useState<PendingLink | null>(() =>
    initialUrl.trackId ? { id: initialUrl.trackId, t: initialUrl.t, select: initialUrl.select } : null,
  );
  const [uiHidden, setUiHidden] = useState(false);
  const [idlePaused, setIdlePaused] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const { toasts, push: toast, dismiss: dismissToast } = useToasts();

  const inputRef = useRef<HTMLInputElement>(null);
  const showUiRef = useRef<HTMLButtonElement>(null);
  const focusBeforeHide = useRef<HTMLElement | null>(null);
  const [headerRef, headerH] = useElementHeight<HTMLElement>();
  const [transportRef, transportH] = useElementHeight<HTMLDivElement>();
  const [onboardingRef, onboardingH] = useElementHeight<HTMLDivElement>();
  const [inspectorRef, inspectorH] = useElementHeight<HTMLElement>();
  const isMd = useMediaQuery('(min-width: 768px)');
  const isLg = useMediaQuery('(min-width: 1024px)');
  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;

  const setView = useCallback((v: ViewMode) => {
    setViewState(v);
    storeView(v);
  }, []);

  // ── Playback controllers ────────────────────────────────────────────────
  // Silent controller always exists (demo / no Premium); the Spotify one when available.
  const silent = useMemo(() => new SilentController(), []);
  useEffect(() => {
    silent.start();
    return () => silent.stop();
  }, [silent]);

  const [spotifyCtl, setSpotifyCtl] = useState<SpotifyController | null>(null);
  const spotifyRef = useRef(spotifyCtl);
  spotifyRef.current = spotifyCtl;
  /** The player currently connecting; a logout while it connects cancels it. */
  const connectingRef = useRef<SpotifyController | null>(null);
  useEffect(() => () => spotifyCtl?.destroy(), [spotifyCtl]);

  const controller: PlaybackController = loaded && !loaded.isDemo && spotifyCtl ? spotifyCtl : silent;
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  /** Which track each controller currently holds. */
  const ctlTrack = useRef(new WeakMap<PlaybackController, string>());

  const connectPlayer = useCallback(async () => {
    connectingRef.current?.destroy();
    const ctl = new SpotifyController({
      onError(msg, fatal) {
        toast({ kind: fatal ? 'error' : 'info', message: msg, key: 'player' });
        if (fatal) {
          ctl.destroy();
          setSpotifyCtl((cur) => (cur === ctl ? null : cur));
          setSession((s) => (s.status === 'logged-in' ? { ...s, audio: 'unavailable' } : s));
        }
      },
    });
    connectingRef.current = ctl;
    try {
      await ctl.init();
      if (connectingRef.current !== ctl) return ctl.destroy(); // logged out (or replaced) meanwhile
      connectingRef.current = null;
      setSpotifyCtl(ctl);
      setSession((s) => (s.status === 'logged-in' ? { ...s, audio: 'ready' } : s));
    } catch (e) {
      ctl.destroy();
      if (connectingRef.current !== ctl) return;
      connectingRef.current = null;
      toast({ kind: 'info', message: message(e, 'The Spotify player is unavailable, so tracks play visual-only.'), key: 'player' });
      setSession((s) => (s.status === 'logged-in' ? { ...s, audio: 'unavailable' } : s));
    }
  }, [toast]);

  const dropPlayer = useCallback(() => {
    connectingRef.current?.destroy();
    connectingRef.current = null;
    setSpotifyCtl(null); // the effect above destroys the installed one
  }, []);

  // ── Boot: finish an OAuth redirect if present, then restore the session ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isAuthConfigured()) {
        setSession({ status: 'unconfigured' });
        return;
      }
      const loginError = await completeLoginIfRedirect();
      if (loginError) toast({ kind: 'error', message: loginError });
      if (!hasSession()) {
        if (!cancelled) setSession({ status: 'logged-out' });
        return;
      }
      try {
        const profile = await getProfile();
        if (cancelled) return;
        const premium = profile.product === 'premium';
        setSession({ status: 'logged-in', name: profile.displayName, premium, audio: premium ? 'connecting' : 'unavailable' });
        if (premium) void connectPlayer();
        else
          toast({
            kind: 'info',
            key: 'premium',
            message: 'Your Spotify account isn’t Premium, so audio can’t play in the browser. The visuals still play in sync, silently.',
          });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof SpotifyApiError && e.status === 403) {
          toast({
            kind: 'error',
            message: 'Spotify refused access. While the Spotify app is in Development Mode, its owner must add your account under User Management.',
          });
        } else toast({ kind: 'error', message: message(e, 'Could not reach Spotify.') });
        logout();
        setSession({ status: 'logged-out' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectPlayer, toast]);

  // When the active controller changes under a loaded track (the Spotify player finished
  // connecting, or failed and we fell back to visual-only), hand the track over at the same position.
  const prevCtlRef = useRef(controller);
  useEffect(() => {
    const prev = prevCtlRef.current;
    prevCtlRef.current = controller;
    if (!loaded || ctlTrack.current.get(controller) === loaded.track.id) return;
    const pos = prev !== controller && ctlTrack.current.get(prev) === loaded.track.id ? prev.clock.nowMs() : 0;
    if (prev !== controller) {
      void prev.pause().catch(() => {});
      ctlTrack.current.delete(prev); // its position is stale now; a later hand-back must reload it
    }
    ctlTrack.current.set(controller, loaded.track.id);
    // Don't auto-resume: starting Spotify audio needs a user gesture.
    void controller.load(loaded.track).then(() => (pos > 0 ? controller.seek(pos) : undefined)).catch(() => {});
  }, [controller, loaded]);

  const switchTo = useCallback(
    async (next: Loaded) => {
      await controllerRef.current.pause().catch(() => {});
      const target = !next.isDemo && spotifyRef.current ? spotifyRef.current : silent;
      await target.load(next.track);
      ctlTrack.current.set(target, next.track.id);
      setSelectedId(null);
      setHoverId(null);
      setLoaded(next);
      return target;
    },
    [silent],
  );

  /** Bumped by every new load, the demo, and logout; an in-flight load that sees a newer value gives up. */
  const loadSeq = useRef(0);
  const cancelLoads = useCallback(() => {
    loadSeq.current++;
    setLoading(false);
    setLoadingLabel(null);
  }, []);

  const sessionExpired = useCallback(() => {
    cancelLoads();
    logout();
    dropPlayer();
    setSession({ status: 'logged-out' });
    toast({ kind: 'error', message: 'Your Spotify session expired. Please log in again.', key: 'session' });
  }, [cancelLoads, dropPlayer, toast]);

  const login = useCallback(
    (search?: string) => {
      beginLogin(search).catch((e) => toast({ kind: 'error', message: message(e, 'Could not start Spotify login.') }));
    },
    [toast],
  );

  /** Login that brings the pending shared link (with its moment and ring) back afterwards. */
  const loginKeepingLink = useCallback(() => {
    login(buildSearch({ trackId: pending?.id, view, t: pending?.t, select: pending?.select }));
  }, [login, pending, view]);

  /** Opens a Spotify track. Resolves true once it's on screen. */
  const loadTrack = useCallback(
    async (id: string, opts: OpenOpts = {}): Promise<boolean> => {
      if (session.status === 'checking') {
        // Still connecting: queue it; the pending-link effect opens it when the session is known.
        setPending({ id, t: opts.t ?? null, select: opts.select ?? null });
        return false;
      }
      if (session.status !== 'logged-in') {
        if (session.status === 'logged-out') login(buildSearch({ trackId: id, view, t: opts.t, select: opts.select }));
        return false;
      }
      const req = ++loadSeq.current;
      const stale = () => req !== loadSeq.current;
      setLoading(true);
      setLoadingLabel('Finding the track…');
      try {
        const track = await getTrack(id);
        if (stale()) return false;
        setLoadingLabel('Reading the music…');
        const features = await resolveFeatures(track, defaultProviders({ spotify: true }));
        if (stale()) return false;
        // Map the song's chakras first, then draw.
        const chakra = await buildChakraMap(track, features, (m) => !stale() && setLoadingLabel(m));
        if (stale()) return false;
        const ctl = await switchTo({ track, features, chakra, isDemo: false });
        if (opts.t) await ctl.seek(Math.min(opts.t * 1000, track.durationMs));
        if (opts.select) setSelectedId(opts.select);
        if (chakra.source === 'estimate') {
          toast({
            kind: 'info',
            key: 'estimate',
            message: 'No preview audio was found for this song, so its chakras are estimated from its key. Add your own copy via ⋯ → “Analyze my audio file” for the real thing.',
          });
        }
        return true;
      } catch (e) {
        if (stale()) return false;
        if (e instanceof SpotifyApiError && e.status === 401) sessionExpired();
        else toast({ kind: 'error', message: message(e, 'Could not load that track.') });
        return false;
      } finally {
        if (!stale()) {
          setLoading(false);
          setLoadingLabel(null);
        }
      }
    },
    [session.status, login, view, switchTo, sessionExpired, toast],
  );

  const loadDemo = useCallback(
    async (opts: OpenOpts = {}) => {
      cancelLoads(); // the demo wins over a track that's still loading
      const ctl = await switchTo({ track: DEMO_TRACK, features: DEMO_FEATURES, chakra: DEMO_CHAKRA, isDemo: true });
      if (opts.t) await ctl.seek(opts.t * 1000);
      if (opts.select) setSelectedId(opts.select);
    },
    [cancelLoads, switchTo],
  );

  // Deep links: ?demo opens the demo immediately; ?track=… (or a link pasted while connecting)
  // opens once logged in. The link is only cleared once the track is on screen, so a reload retries.
  const demoBooted = useRef(false);
  const attempted = useRef<PendingLink | null>(null);
  useEffect(() => {
    if (initialUrl.demo && !demoBooted.current) {
      demoBooted.current = true;
      void loadDemo({ t: initialUrl.t, select: initialUrl.select });
      return;
    }
    if (!pending || session.status === 'checking' || attempted.current === pending) return;
    if (session.status === 'logged-in') {
      attempted.current = pending;
      void loadTrack(pending.id, pending).then((ok) => {
        if (ok) setPending((p) => (p === pending ? null : p));
      });
    } else if (session.status === 'unconfigured') {
      attempted.current = pending;
      setPending(null);
      toast({ kind: 'info', message: 'That link opens a Spotify track, but Spotify login isn’t enabled on this site. Here’s the demo instead.' });
      void loadDemo();
    }
    // logged-out: the onboarding card asks the user to log in, then we come back here.
  }, [initialUrl, pending, session.status, loadTrack, loadDemo, toast]);

  // Keep the address bar shareable: ?track=…|?demo, &view=waves (plus a pending link's moment).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('code')) return; // OAuth return still being processed
    const p = loaded ? null : pending;
    const trackId = loaded ? (loaded.isDemo ? null : loaded.track.id) : (p?.id ?? null);
    replaceSearch(buildSearch({ trackId, demo: !!loaded?.isDemo, view, t: p?.t, select: p?.select }));
  }, [loaded, pending, view]);

  // ── File analysis & export ───────────────────────────────────────────────
  /** Full-song, second-by-second analysis from the user's own copy of the song. */
  const handleOwnFile = async (file: File) => {
    if (!loaded) return;
    const trackId = loaded.track.id;
    setAnalyzingFile(0);
    try {
      const chakra = await analyzeOwnFile(file, setAnalyzingFile);
      if (chakra.timeline && Math.abs(chakra.timeline.frames * chakra.timeline.hop * 1000 - loaded.track.durationMs) > 15_000) {
        toast({ kind: 'info', message: 'That file’s length doesn’t match this song, so the colours may be out of sync.' });
      } else toast({ kind: 'success', message: 'Analyzed your file: the rings now follow the whole song.' });
      setLoaded((l) => (l && l.track.id === trackId ? { ...l, chakra } : l));
    } catch {
      toast({ kind: 'error', message: 'Couldn’t read that audio file. Try an MP3, M4A or WAV.' });
    } finally {
      setAnalyzingFile(null);
    }
  };

  const features = loaded?.features ?? DEMO_FEATURES;
  const track = loaded?.track ?? DEMO_TRACK;
  const chakra = loaded?.chakra ?? DEMO_CHAKRA;
  const rings = useMemo(() => buildRings(features, chakra, track.durationMs / 1000), [features, chakra, track]);
  const selectedRing = rings.find((r) => r.id === selectedId) ?? null;

  const doExport = async (kind: 'png' | 'svg', transparent: boolean) => {
    if (!loaded) return;
    setExporting(true);
    try {
      const input = { rings, features, track, t: controller.clock.nowMs() / 1000, transparent, view };
      if (kind === 'svg') exportSvg(input);
      else await exportPng(input);
      toast({ kind: 'success', message: `Saved the ${view} as ${kind.toUpperCase()}.` });
    } catch (e) {
      toast({ kind: 'error', message: message(e, 'Export failed.') });
    } finally {
      setExporting(false);
    }
  };

  const share = async () => {
    if (!loaded) return;
    const url = shareUrl({
      trackId: loaded.isDemo ? null : loaded.track.id,
      demo: loaded.isDemo,
      view,
      t: controller.clock.nowMs() / 1000,
      select: selectedId,
    });
    try {
      await navigator.clipboard.writeText(url);
      toast({ kind: 'success', message: 'Link copied. It opens this song, view and moment.' });
    } catch {
      toast({ kind: 'info', message: `Copy this link: ${url}`, persist: true });
    }
  };

  // ── Transport ─────────────────────────────────────────────────────────────
  const toggle = useCallback(async () => {
    const ctl = controllerRef.current;
    try {
      if (ctl.clock.isPlaying()) await ctl.pause();
      else await ctl.play();
    } catch (e) {
      if (e instanceof SpotifyApiError && e.status === 401) sessionExpired();
      else toast({ kind: 'error', message: message(e, 'Playback failed.'), key: 'playback' });
    }
  }, [sessionExpired, toast]);

  const seek = useCallback(
    async (ms: number) => {
      const ctl = controllerRef.current;
      const clamped = Math.max(0, Math.min(ms, ctl.clock.durationMs || ms));
      try {
        await ctl.seek(clamped);
      } catch (e) {
        toast({ kind: 'error', message: message(e, 'Seek failed.'), key: 'playback' });
      }
    },
    [toast],
  );

  const stepRing = useCallback(
    (delta: 1 | -1) => {
      const ids = rings.map((r) => r.id);
      const cur = ids.indexOf(selectedId ?? '');
      const next = cur < 0 ? (delta > 0 ? 0 : ids.length - 1) : (cur + delta + ids.length) % ids.length;
      setSelectedId(ids[next]);
    },
    [rings, selectedId],
  );

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => toast({ kind: 'info', message: 'Full screen isn’t available here.' }));
  }, [toast]);

  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // Immersive mode: the chrome becomes inert, so focus can't sit on (or Tab into) invisible controls.
  const hideUi = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    focusBeforeHide.current = active && active !== document.body ? active : null;
    setUiHidden(true);
    setHoverId(null);
    requestAnimationFrame(() => showUiRef.current?.focus({ preventScroll: true }));
  }, []);
  const showUi = useCallback(() => {
    setUiHidden(false);
    const back = focusBeforeHide.current;
    focusBeforeHide.current = null;
    // After the inert attribute is removed, put focus back where it was.
    requestAnimationFrame(() => {
      if (back?.isConnected && !back.closest('[inert]')) back.focus({ preventScroll: true });
    });
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const keyState = useRef({ loaded, selectedId, uiHidden, helpOpen });
  keyState.current = { loaded, selectedId, uiHidden, helpOpen };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // AltGr arrives as Ctrl+Alt on Windows; it's how many layouts type [ ] / ?.
      if (e.defaultPrevented || e.metaKey || ((e.ctrlKey || e.altKey) && !e.getModifierState('AltGraph'))) return;
      const st = keyState.current;
      if (st.helpOpen) return; // the dialog handles its own keys
      const el = e.target as HTMLElement;
      // Typing fields keep every key; sliders keep only their arrows/Home/End (below).
      if (el.closest('input:not([type="range"]), textarea, select, [contenteditable="true"], [role="menu"]')) return;
      const onRange = el.matches('input[type="range"]');
      const onControl = !onRange && !!el.closest('button, a, [role="radio"], [role="radiogroup"]');
      const ctl = controllerRef.current;

      switch (e.key) {
        case ' ':
          if (onControl) return; // let focused buttons activate natively
          if (!st.loaded) {
            setIdlePaused((p) => !p); // landing: pause/play the ambient animation
            break;
          }
          void toggle();
          break;
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!st.loaded || onRange || el.closest('[role="radiogroup"]')) return;
          const step = (e.shiftKey ? SEEK_BIG_STEP_MS : SEEK_STEP_MS) * (e.key === 'ArrowLeft' ? -1 : 1);
          void seek(ctl.clock.nowMs() + step);
          break;
        }
        case 'm':
        case 'M':
          setView(view === 'mandala' ? 'waves' : 'mandala');
          break;
        case '[':
          if (!st.loaded) return;
          stepRing(-1);
          break;
        case ']':
          if (!st.loaded) return;
          stepRing(1);
          break;
        case 'Escape':
          if (st.selectedId) setSelectedId(null);
          else if (st.uiHidden) showUi();
          else return;
          break;
        case 'h':
        case 'H':
          if (st.uiHidden) showUi();
          else hideUi();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case '/':
          setUiHidden(false);
          requestAnimationFrame(() => inputRef.current?.focus());
          break;
        case '?':
          setHelpOpen(true);
          break;
        default:
          if (/^[1-7]$/.test(e.key) && st.loaded) {
            const id = rings[Number(e.key) - 1]?.id ?? null;
            setSelectedId((cur) => (cur === id ? null : id));
            break;
          }
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seek, setView, view, stepRing, hideUi, showUi, toggleFullscreen, rings]);

  // ── Document title & OS media controls ───────────────────────────────────
  useEffect(() => {
    document.title = loaded ? `${loaded.track.name} · ${loaded.track.artists.join(', ')} — Harmonic Mandala` : 'Harmonic Mandala — see the chakras of a song';
  }, [loaded]);

  useEffect(() => {
    const ms = 'mediaSession' in navigator ? navigator.mediaSession : null;
    if (!ms || !loaded) return;
    const setHandler = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(a, h);
      } catch {
        /* action unsupported in this browser */
      }
    };
    try {
      ms.metadata = new MediaMetadata({
        title: loaded.track.name,
        artist: loaded.track.artists.join(', '),
        album: loaded.track.album,
        artwork: loaded.track.albumArt ? [{ src: loaded.track.albumArt, sizes: '300x300' }] : [],
      });
    } catch {
      /* MediaMetadata unsupported */
    }
    setHandler('play', () => void (controllerRef.current.clock.isPlaying() || toggle()));
    setHandler('pause', () => void (controllerRef.current.clock.isPlaying() && toggle()));
    setHandler('seekbackward', () => void seek(controllerRef.current.clock.nowMs() - 10_000));
    setHandler('seekforward', () => void seek(controllerRef.current.clock.nowMs() + 10_000));
    setHandler('seekto', (d) => d.seekTime != null && void seek(d.seekTime * 1000));
    return () => {
      ms.metadata = null;
      for (const a of MEDIA_ACTIONS) setHandler(a, null);
    };
  }, [loaded, toggle, seek]);

  // ── Layout: keep the drawing clear of the UI around it ───────────────────
  // Landing: keep the drawing above the onboarding card on tall screens; on short ones let it sit behind.
  const idleBottom = onboardingH && onboardingH < window.innerHeight * 0.42 ? onboardingH + 16 : 96;
  // Phones: the inspector is a bottom sheet above the transport, so the drawing moves up out of its way.
  const sheetH = selectedRing && !isMd && inspectorH ? inspectorH + 8 : 0;
  const inset = {
    top: uiHidden ? 12 : headerH + 8,
    bottom: uiHidden ? 12 : (loaded ? transportH : idleBottom) + 8 + sheetH,
    left: !uiHidden && loaded && view === 'mandala' && isLg ? LEGEND_W : 0,
    right: !uiHidden && selectedRing && isMd ? INSPECTOR_W : 0,
  };

  const onLogout = () => {
    cancelLoads();
    logout();
    dropPlayer();
    setSession({ status: 'logged-out' });
    if (loaded && !loaded.isDemo) setLoaded(null);
    toast({ kind: 'success', message: 'Logged out of Spotify.' });
  };

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-void ${uiHidden ? 'chrome-hidden' : ''}`}
      style={{ '--header-h': `${headerH || 72}px`, '--transport-h': `${transportH || 96}px` } as React.CSSProperties}
    >
      {/* The interface. Rendered before the canvas so it comes first in Tab order; inert while hidden. */}
      <div className="contents" inert={uiHidden}>
        <Header
          ref={headerRef}
          session={session}
          view={view}
          onViewChange={setView}
          loading={loading}
          loadingLabel={loadingLabel}
          onLogin={loginKeepingLink}
          onLogout={onLogout}
          onLoad={(id) => void loadTrack(id)}
          onDemo={() => void loadDemo()}
          onHelp={() => setHelpOpen(true)}
          inputRef={inputRef}
        />
      </div>

      <ToastHost toasts={toasts} onDismiss={dismissToast} />

      <Visualizer
        view={view}
        rings={rings}
        features={features}
        durationMs={track.durationMs}
        clock={loaded ? controller.clock : null}
        interactive={!!loaded && !uiHidden}
        hoverId={hoverId}
        selectedId={selectedId}
        onHover={setHoverId}
        onSelect={setSelectedId}
        inset={inset}
        idlePaused={idlePaused}
      />

      <div className="contents" inert={uiHidden}>
        {!loaded && (
          <Onboarding
            ref={onboardingRef}
            session={session}
            pendingTrack={!!pending}
            redirectUri={redirectUri()}
            onLogin={loginKeepingLink}
            onDemo={() => void loadDemo()}
            onFocusLink={() => inputRef.current?.focus()}
            idlePaused={idlePaused}
            onToggleIdle={() => setIdlePaused((p) => !p)}
          />
        )}

        {loaded && (
          <>
            {view === 'mandala' && (
              <RingLegend
                rings={rings}
                clock={controller.clock}
                hoverId={hoverId}
                selectedId={selectedId}
                onHover={setHoverId}
                onSelect={setSelectedId}
                sourceSummary={chakra.sourceLabel}
              />
            )}
            {selectedRing && (
              <Inspector
                ref={inspectorRef}
                ring={selectedRing}
                clock={controller.clock}
                view={view}
                onClose={() => setSelectedId(null)}
                onStep={stepRing}
              />
            )}
            <TransportBar
              ref={transportRef}
              track={track}
              controller={controller}
              isDemo={loaded.isDemo}
              view={view}
              sections={features.sections}
              onToggle={toggle}
              onSeek={seek}
              onExport={doExport}
              exporting={exporting}
              onAudioFile={handleOwnFile}
              analyzingFile={analyzingFile}
              onShare={share}
              onHideUi={hideUi}
              fullscreen={fullscreen}
              canFullscreen={canFullscreen}
              onToggleFullscreen={toggleFullscreen}
              onDemo={() => void loadDemo()}
            />
          </>
        )}
      </div>

      {uiHidden && (
        <button
          ref={showUiRef}
          onClick={showUi}
          className="fade-in absolute right-[max(16px,env(safe-area-inset-right))] bottom-[max(16px,env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white/50 backdrop-blur transition hover:text-white focus-visible:text-white"
        >
          <EyeOffIcon size={14} /> Show interface <kbd className="kbd max-sm:hidden">H</kbd>
        </button>
      )}

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
