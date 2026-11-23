# Harmonic Mandala

Turn any Spotify track into a living, rotating polar-wave mandala. Log in with
Spotify, paste a track link, and watch the song's notes, frequencies and sounds
become seven chakra wave rings that rotate and pulse in sync with playback.

Two views of the same seven functions (switch with the toggle in the header or
press **M**):

- **Mandala**: each function wrapped around a circle, Root in the centre to Crown
  on the outside.
- **Waves**: the same functions unrolled onto a horizontal axis, one lane per
  chakra (Crown on top, Root at the bottom), with live equations and a θ / y
  crosshair readout.

## Quick start

```bash
npm install
cp .env.example .env      # then set VITE_SPOTIFY_CLIENT_ID
npm run dev               # http://127.0.0.1:5173
```

No Spotify setup yet? Open `http://127.0.0.1:5173/?demo` (or click **Demo**) for a
silent, clock-driven demo of every feature except audio.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` tests, builds and publishes the site on every push
to `main`, at `https://<user>.github.io/<repo>/`.

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → Variables → New repository
   variable:** `VITE_SPOTIFY_CLIENT_ID` = your Spotify Client ID. It's a public
   identifier under PKCE, so a variable (not a secret) is right. Without it the
   site still works in demo-only mode.
3. In the [Spotify dashboard](https://developer.spotify.com/dashboard), add the
   redirect URI `https://<user>.github.io/<repo>/` (with the trailing slash).
4. Push to `main` (or run the workflow from the **Actions** tab).

Optional repository variables: `VITE_SPOTIFY_REDIRECT_URI` (override the redirect
URI), `VITE_DISABLE_RECCOBEATS`, `VITE_DISABLE_PREVIEW_ANALYSIS`, and `BASE_PATH`
(set to `/` for a custom domain). To try the Pages build locally:

```bash
BASE_PATH=music-player VITE_SPOTIFY_REDIRECT_URI= npm run build && BASE_PATH=music-player npm run preview
# → http://127.0.0.1:5173/music-player/
```

(`BASE_PATH` is written without slashes so Git Bash on Windows doesn't rewrite it
as a file path. Clearing `VITE_SPOTIFY_REDIRECT_URI` makes login return to
`http://127.0.0.1:5173/music-player/`; register that URI in Spotify too if you
want to test login against this local build.)

GitHub Pages has no server-side routing, so the app handles everything from its
root URL: the OAuth redirect comes back to the root, and the workflow copies
`index.html` to `404.html` so any deep path still boots the app.

### Shareable links

The address bar always reflects what's on screen, and **⋯ → Copy link to this
moment** adds the playback position:

| Query | Effect |
| --- | --- |
| `?track=<id>` | Opens that Spotify track (after login, if needed) |
| `?demo` | Opens the silent demo |
| `&view=waves` | Starts in the Waves view |
| `&t=<seconds>` | Starts at that position |
| `&select=<ring>` | Opens a ring's inspector (`root`, `sacral`, `solar`, `heart`, `throat`, `third-eye`, `crown`) |

### Spotify app setup

1. Create an app at <https://developer.spotify.com/dashboard>.
2. Under **APIs used**, enable **Web API** and **Web Playback SDK**.
3. Add the redirect URI `http://127.0.0.1:5173/callback` for local dev (it's set
   in `.env`). Spotify rejects `localhost`, so use the loopback IP. For GitHub
   Pages add `https://<user>.github.io/<repo>/` too (see above). When
   `VITE_SPOTIFY_REDIRECT_URI` is unset, the app uses its own root URL.
4. Copy the **Client ID** into `.env`. No client secret is needed: the app uses
   Authorization Code + **PKCE**, so nothing secret ships to the browser and no
   token-exchange backend is required.
5. While the app is in Development Mode, add each tester under **User Management**.

In-browser audio needs **Spotify Premium** (a Web Playback SDK requirement). Free
accounts can still load tracks and get a *visual-only* mandala driven by a local
clock.

## How it works

| Layer | Files |
| --- | --- |
| Auth (PKCE, refresh) | `src/spotify/auth.ts` |
| Track link parsing | `src/spotify/parseTrackLink.ts` |
| Playback (SDK + silent fallback) | `src/playback/controllers.ts` |
| Interpolated 60 fps clock | `src/playback/clock.ts` |
| Audio-feature providers | `src/features/*` |
| Ring math (Rᵢ, kᵢ, Aᵢ(t), φᵢ(t)) | `src/mandala/rings.ts` |
| Polar sampling + hit testing | `src/mandala/geometry.ts` |
| Waves view: lane layout, sampling, hit testing | `src/mandala/waves.ts` |
| Scene → Canvas / SVG | `src/mandala/scene.ts`, `render.ts`, `svg.ts` |
| PNG / SVG export (both views) | `src/mandala/export.ts` |
| Render loop, both views | `src/components/Visualizer.tsx` |
| Shareable URL state | `src/lib/url.ts` |

**Polar mapping.** Ring *i* is `rᵢ(θ,t) = Rᵢ + Aᵢ(t)·wᵢ(kᵢθ + φᵢ(t))`, then
`x = r cos θ`, `y = r sin θ`. Base radii are evenly spaced from 0.15 to 0.86 of
the outer radius. Amplitudes are clamped to 56% of the ring gap, so rings can
touch but never cross a neighbour's centre line. Unit tests check this bound
across whole songs.

**Waves mapping.** The Waves view plots each ring's displacement from its base
circle against the angle: `yᵢ(x,t) = Aᵢ(t)·wᵢ(kᵢx + φᵢ(t)) = rᵢ(x,t) − Rᵢ` for
`x = θ ∈ [0, 2π)`. All lanes share one vertical scale (the largest possible swing
fills 78% of half a lane), so amplitudes compare directly. The vertical guides
are the mandala's 12 pitch-class spokes, unrolled, with the song's key tinted.

**Chakra rings** (`src/chakra/`). Seven rings, Root (inside) to Crown (outside),
in traditional colours. Each stays grey until its chakra is present in the
music, then fades into colour.

| Chakra | Note | Hz | Sound type | Lobes k |
| --- | --- | --- | --- | --- |
| Root · Muladhara · Lam | C | 396 | deep, grounding; drums | 4 |
| Sacral · Svadhisthana · Vam | D | 417 | flowing; wind, trumpets | 6 |
| Solar Plexus · Manipura · Ram | E | 528 | bright, metallic | 10 |
| Heart · Anahata · Yam | F | 639 | melodic strings, singing bowls | 12 |
| Throat · Vishuddha · Ham | G | 741 | voice, humming, flute | 16 |
| Third Eye · Ajna · Om | A | 852 | bells, gentle bowls | 2 |
| Crown · Sahasrara | B | 963 | stillness, chimes | 24 (of 1000 petals) |

Lobe counts are the traditional petal counts. Each chakra's strength is
`0.5·note + 0.25·frequency + 0.25·sound type`:
- **Note:** the share of the music on that note. Sharps split between their
  neighbours, so C♯ counts half Root and half Sacral.
- **Frequency:** a peak within ±1.5% of the Solfeggio frequency.
- **Sound type:** rough spectral cues, such as bass hits for drums or
  high-pitched tones for bells.

These are traditional associations, not scientific findings.

The app maps each song before drawing it, using the first source available:
1. **Your own audio file** ("Use my audio file"): the whole song is analyzed
   second by second and synced to playback. The file never leaves the browser.
2. **The official 30-second preview** from Apple's iTunes Search API, matched by
   title, artist and duration. This gives the song's overall chakra balance.
   Its timing follows the song's tempo, because it's unknown where in the song
   the preview starts.
3. **An estimate** from the key and Spotify-style traits, when no audio is found.

**Feature providers.** Spotify locked `audio-features` and `audio-analysis` for
apps created after Nov 2024, so features resolve through a provider chain. The
first valid value for each field wins:

1. `spotifyProvider`: Spotify audio-features and analysis. Works only if your app
   still has access; a 403 is ignored.
2. `reccoBeatsProvider`: the public ReccoBeats API, looked up by Spotify track ID.
   Set `VITE_DISABLE_RECCOBEATS=true` to turn it off.
3. `derivedProvider`: fills every missing field with a deterministic derivation
   from track metadata (ID, ISRC, title, artists, duration). The same song always
   gives the same mandala.

The inspector shows which source supplied each value. To add a provider,
implement `AudioFeatureProvider` and add it to `defaultProviders()`.

**Sync.** The Spotify SDK reports position only on state events and when polled
(once per second here). `PlaybackClock` extrapolates position with
`performance.now()`. It corrects drift under 250 ms by running slightly faster or
slower for about one second, and snaps to the new position for anything larger,
such as a seek.

## Scripts

`npm run dev` · `npm run build` (typecheck and bundle) · `npm test` (Vitest) ·
`npm run preview`

## Controls

Hover a ring (or lane) for its name and live values; click it to open the
inspector. Press **?** in the app for the full list.

| Key | Action |
| --- | --- |
| Space | Play / pause |
| ← / → | Seek 5 s (Shift: 15 s) |
| M | Switch Mandala ↔ Waves |
| 1 – 7 | Inspect a chakra (Root … Crown) |
| [ / ] | Previous / next chakra |
| Esc | Close the inspector / show the interface |
| H | Hide the interface (immersive mode) |
| F | Full screen |
| / | Focus the track-link box |

Pasting a valid track link loads it immediately. If you're logged out, the app
sends you through Spotify login and opens the track when you come back. Exports
(**⋯** menu) save whichever view is on screen.
