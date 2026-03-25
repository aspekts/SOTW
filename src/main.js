const LASTFM_KEY   = import.meta.env.VITE_LASTFM_KEY;
const SPOTIFY_CID  = import.meta.env.VITE_SPOTIFY_CID;
const SPOTIFY_CS   = import.meta.env.VITE_SPOTIFY_CS;
const LASTFM_USER  = 'aspekts';

const CACHE_TRACKS = 'sotw_tracks_v1';
const CACHE_TOKEN  = 'sotw_spotify_token';
const CACHE_TTL    = 10 * 60 * 1000; // 10 min

// ── Date display ──────────────────────────────────────────────
const el = document.getElementById('hero-date');
if (el) {
  el.textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ── Spotify token (cached) ────────────────────────────────────
async function getSpotifyToken() {
  const raw = sessionStorage.getItem(CACHE_TOKEN);
  if (raw) {
    const { token, expires } = JSON.parse(raw);
    if (Date.now() < expires) return token;
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${SPOTIFY_CID}:${SPOTIFY_CS}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error('Spotify auth failed');
  const { access_token, expires_in } = await res.json();

  sessionStorage.setItem(CACHE_TOKEN, JSON.stringify({
    token: access_token,
    expires: Date.now() + (expires_in - 60) * 1000,
  }));

  return access_token;
}

// ── Last.fm top tracks ────────────────────────────────────────
async function fetchLastFmTracks() {
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  url.searchParams.set('method', 'user.gettoptracks');
  url.searchParams.set('user', LASTFM_USER);
  url.searchParams.set('limit', '5');
  url.searchParams.set('period', '7day');
  url.searchParams.set('api_key', LASTFM_KEY);
  url.searchParams.set('format', 'json');

  const res = await fetch(url);
  if (!res.ok) throw new Error('Last.fm request failed');
  const data = await res.json();
  return data.toptracks.track;
}

// ── Title matching helpers ────────────────────────────────────

// Strip parentheticals, punctuation, and normalise whitespace for comparison.
// e.g. "Bohemian Rhapsody (Remastered 2011)" → "bohemian rhapsody"
function normalise(str) {
  return str
    .toLowerCase()
    .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '') // remove (…) and […]
    .replace(/[^a-z0-9\s]/g, '')             // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

// True if either string starts with the other (handles one being a prefix of
// the other, e.g. "Money" vs "Money (That's What I Want)").
function titlesMatch(a, b) {
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return false;
  return na === nb || na.startsWith(nb) || nb.startsWith(na);
}

// More lenient: match if either artist string contains the other.
// Handles "Daft Punk" matching "Daft Punk feat. Pharrell Williams".
function artistsMatch(a, b) {
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// ── Spotify search (with match verification) ──────────────────
async function searchSpotify(token, track) {
  const query = encodeURIComponent(`${track.artist.name} ${track.name}`);
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${query}&type=track&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;

  const candidates = (await res.json()).tracks?.items ?? [];

  // Best case: title AND artist both match
  const full = candidates.find(sp =>
    titlesMatch(track.name, sp.name) &&
    sp.artists.some(a => artistsMatch(track.artist.name, a.name))
  );
  if (full) return full;

  // Fallback: title-only match (artist may be listed differently)
  const titleOnly = candidates.find(sp => titlesMatch(track.name, sp.name));
  if (titleOnly) return titleOnly;

  // No confident match — skip the embed rather than show a wrong song
  console.warn(`No Spotify match for: ${track.artist.name} – ${track.name}`);
  return null;
}

// ── Render ────────────────────────────────────────────────────
function renderTracks(tracks, spotifyResults) {
  const list = document.getElementById('track-list');

  list.innerHTML = tracks.map((track, i) => {
    const sp = spotifyResults[i];
    const rank = String(i + 1).padStart(2, '0');

    const embedHtml = sp
      ? `<div class="track-embed">
           <iframe
             src="https://open.spotify.com/embed/track/${sp.id}?utm_source=generator"
             allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
             loading="lazy"
           ></iframe>
         </div>`
      : '';

    const nameHtml = sp
      ? `<a href="${sp.external_urls.spotify}" target="_blank" rel="noopener">${track.name}</a>`
      : track.name;

    return `
      <article class="track-card">
        <span class="track-rank">${rank}</span>
        <div class="track-body">
          <div class="track-name">${nameHtml}</div>
          <div class="track-artist">${track.artist.name}</div>
          ${embedHtml}
        </div>
      </article>`;
  }).join('');
}

function renderError(msg) {
  const list = document.getElementById('track-list');
  list.innerHTML = `<div class="error-card">${msg}</div>`;
}

// ── Main ──────────────────────────────────────────────────────
async function load() {
  // Check full-result cache
  const cached = sessionStorage.getItem(CACHE_TRACKS);
  if (cached) {
    const { tracks, spotify, expires } = JSON.parse(cached);
    if (Date.now() < expires) {
      renderTracks(tracks, spotify);
      return;
    }
  }

  try {
    // Fetch Last.fm + Spotify token in parallel
    const [tracks, token] = await Promise.all([
      fetchLastFmTracks(),
      getSpotifyToken(),
    ]);

    // Search all tracks in parallel
    const spotifyResults = await Promise.all(
      tracks.map(t => searchSpotify(token, t))
    );

    // Cache and render
    sessionStorage.setItem(CACHE_TRACKS, JSON.stringify({
      tracks,
      spotify: spotifyResults,
      expires: Date.now() + CACHE_TTL,
    }));

    renderTracks(tracks, spotifyResults);
  } catch (err) {
    console.error(err);
    renderError('Could not load tracks. Please try again later.');
  }
}

load();
