# Harmonic Mandala

Turn any Spotify track into a living, rotating polar-wave mandala. Log in with
Spotify, paste a track link, and watch tempo, groove, key, energy, mood and song
structure become six concentric wave rings that rotate and pulse in sync with
playback.

## Quick start

```bash
npm install
cp .env.example .env      # then set VITE_SPOTIFY_CLIENT_ID
npm run dev               # http://127.0.0.1:5173
```

No Spotify setup yet? Open `http://127.0.0.1:5173/?demo` (or click **Demo**) for a
silent, clock-driven demo of every feature except audio.

### Spotify app setup

1. Create an app at <https://developer.spotify.com/dashboard>.
2. Under **APIs used**, enable **Web API** and **Web Playback SDK**.
3. Add the redirect URI `http://127.0.0.1:5173/callback`. Spotify rejects
   `localhost`, so use the loopback IP. Add your production URL's `/callback` too.
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
| Scene → Canvas / SVG | `src/mandala/scene.ts`, `render.ts`, `svg.ts` |
| PNG / SVG export | `src/mandala/export.ts` |

**Polar mapping.** Ring *i* is `rᵢ(θ,t) = Rᵢ + Aᵢ(t)·wᵢ(kᵢθ + φᵢ(t))`, then
`x = r cos θ`, `y = r sin θ`. Base radii are evenly spaced from 0.15 to 0.86 of
the outer radius. Amplitudes are clamped to 56% of the ring gap, so rings can
touch but never cross a neighbour's centre line. Unit tests check this bound
across whole songs.

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

Space plays or pauses. Hover a ring for its name and click it to open the
inspector. Esc closes the inspector. The ring list on the left is
keyboard-accessible.
