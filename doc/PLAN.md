# WebDeeJayTools Implementation Plan

## 1. Vision & Goals

WebDeeJayTools is a specialized local web application designed for DJ automation workflows. It provides a web interface with a sleek, responsive dark theme and a left-side navigation rail hosting modular tools:

1. **Tool 1: Playlist Converter / Exporter / Importer**
   - Manage multiple Qobuz and Spotify accounts.
   - Paste a source track/album/playlist URL from Spotify or Qobuz.
   - Auto-detect source service, preview tracklist.
   - Select target service & account.
   - Select existing playlist or create a new one on the fly.
   - Fuzzy match source tracks against target catalog (ISRC, duration, title/artist heuristics).
   - Display match outcomes (hits, misses, confidence scores, and success percentage).
   - Add hits to target playlist.

2. **Tool 2: Track & Playlist Downloader**
   - Download individual tracks, albums, or playlists directly to local disk.
   - Support high quality MP3 (320kbps) and lossless FLAC (16/44.1, 24/96, 24/192) via Qobuz streaming API.
   - Embed high-resolution album artwork into audio files.
   - Write standard ID3v2 tags (MP3) and Vorbis comments (FLAC).
   - Sanitize directory and track names with customizable templates (`{artist} - {album} ({year})`, etc.).
   - Automatically generate `.m3u` playlists for downloaded folders.

3. **Tool 3: Admin & Settings Panel (Bottom Navbar)**
   - Manage credentials for multiple Qobuz accounts (email/password with automatic token & secret extraction).
   - Manage Spotify credentials (Client ID / Client Secret / OAuth tokens).
   - Set default download directory, default audio quality, and naming templates.
   - System diagnostics and connection test utilities.

---

## 2. Architecture Overview

### Tech Stack
- **Language**: TypeScript 5+ (fullstack end-to-end type safety)
- **Frontend**: React 18/19, Vite, Tailwind CSS, Lucide Icons
- **Backend**: Node.js, Express (or Vite plugin backend middleware), Server-Sent Events (SSE) for real-time progress streaming
- **Storage**: Local JSON database (`data/db.json`) for accounts, settings, and download cache
- **Audio & Tagging**: `node-id3` / `music-metadata` / `flac-tagger`
- **Network**: Native `fetch` with custom session management, automatic Qobuz web player bundle scraper for secrets

### Directory Structure
```
webdeejaytools/
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── doc/
│   ├── ARCHITECTURE.md
│   ├── PLAN.md
│   └── TODO.md
├── src/
│   ├── client/                    # React UI
│   │   ├── components/            # Layout, Navbar, Wizard, Table, Progress
│   │   ├── pages/
│   │   │   ├── Converter/         # Tool 1: Step-by-step conversion wizard
│   │   │   ├── Downloader/        # Tool 2: Track/playlist downloader UI
│   │   │   └── Admin/             # Tool 3: Account & settings manager
│   │   ├── hooks/                 # useSSE, useAccounts, useSettings
│   │   ├── services/              # Client API wrapper
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── server/                    # Node.js backend
│   │   ├── index.ts               # Express server + SSE handler
│   │   ├── config.ts
│   │   ├── db/                    # JSON database manager
│   │   ├── services/
│   │   │   ├── qobuz/             # Qobuz bundle scrape, sign, API, download
│   │   │   ├── spotify/           # Spotify Web API client
│   │   │   ├── matcher/           # Fuzzy track matching engine
│   │   │   ├── downloader/        # Download queue, file stream, tagger
│   │   │   └── sanitize/          # Naming sanitization, m3u generator
│   │   └── routes/                # Express API routes
│   └── shared/
│       └── types.ts               # Shared interfaces (Account, Track, Job, etc.)
```

---

## 3. Detailed Implementation Phases

### Phase 1: Project Scaffolding & Shared Data Models
- [ ] Initialize `package.json` with scripts (`dev`, `build`, `start`, `test`).
- [ ] Configure `tsconfig.json`, `tsconfig.node.json`, and `vite.config.ts`.
- [ ] Setup Tailwind CSS and UI design tokens (dark DJ aesthetic).
- [ ] Define shared domain types in `src/shared/types.ts`:
  - `ServiceType = 'qobuz' | 'spotify'`
  - `Account` (id, service, label, credentials, token, status)
  - `TrackMetadata` (title, artist, album, year, isrc, duration, trackNumber, coverUrl)
  - `ConversionJob` & `MatchResult`
  - `DownloadJob` & `DownloadProgress`

### Phase 2: Qobuz Service (Ported from `qobuz-dj` & `m4l-qobuz-dj`)
- [ ] **Bundle Scraper**: Scrape `play.qobuz.com/login` and bundle JS to dynamically extract `app_id` and `secrets`.
- [ ] **Request Signing**: MD5 request signature generation for `getFileUrl` and `getUserFavorites`.
- [ ] **API Client**:
  - Authentication (`user/login` -> user auth token).
  - URL parser (supporting track, album, playlist, artist URLs).
  - Metadata resolution (`track/get`, `album/get`, `playlist/get`, `artist/get`).
  - Catalog search (`track/search`, `album/search`).
  - User playlist management (`playlist/getUserPlaylists`, `playlist/create`, `playlist/addTracks`).
  - Signed streaming audio URL generation (`track/getFileUrl`).

### Phase 3: Spotify Service
- [ ] **Spotify API Client**:
  - Client Credentials and OAuth Authorization Code (or User Token) support.
  - URL parser (track, album, playlist, artist URLs).
  - Metadata resolution (`/tracks/{id}`, `/albums/{id}`, `/playlists/{id}`).
  - Catalog search (`/search?type=track`).
  - User playlist management (`/users/{id}/playlists`, `/playlists/{id}/tracks`).

### Phase 4: Track Matching Engine
- [ ] **Metadata Normalization**:
  - Remove "(Remastered 2011)", "[Club Mix]", "feat. XYZ", "Original Mix" for core title search.
  - Unicode character cleanup.
- [ ] **Fuzzy Matching Heuristics**:
  - Tier 1: Exact ISRC match (100% confidence).
  - Tier 2: Exact Artist + Title match.
  - Tier 3: Normalized Title + Artist Levenshtein distance $\le 2$.
  - Tier 4: Duration delta verification ($\pm 3$ seconds bonus, $> 30$ seconds penalty).
- [ ] Hit / Miss categorization with detailed diagnostic output and confidence score.

### Phase 5: Downloader Engine & Tagging
- [ ] Stream audio directly from Qobuz signed URLs to target filesystem directory.
- [ ] Tag files:
  - ID3v2 for MP3 files (Artist, Title, Album, Year, Track Number, Embedded APIC Cover Art).
  - Vorbis comments for FLAC files.
- [ ] Filename and folder formatting template engine (`{artist} - {album} ({year})/{tracknumber} - {tracktitle}.mp3`).
- [ ] Automatic `.m3u` playlist generation for downloaded albums and playlists.
- [ ] Download queue with concurrent task limit and real-time progress broadcast via SSE.

### Phase 6: Web UI & Tool Views
- [ ] **Layout**:
  - Vertical left sidebar with icon buttons:
    - 🔄 Playlist Converter
    - ⬇️ Track Downloader
    - ⚙️ Admin Panel (pinned to bottom)
  - Main display panel with smooth transitions.
- [ ] **Tool 1: Playlist Converter UI**:
  - Step 1: Input URL -> Auto-detect source service & preview tracklist.
  - Step 2: Source Account & Target Account selection.
  - Step 3: Target Playlist selection (Existing vs Create New).
  - Step 4: Live matching progress -> Results Table (Hits in green, Misses in red/yellow, match percentage, action to commit tracks to target playlist).
- [ ] **Tool 2: Downloader UI**:
  - URL input or account playlist browser.
  - Target directory selector & quality selector (MP3 320, FLAC 16/44.1, Hi-Res).
  - Active download queue with progress bars, speed, and status logs.
- [ ] **Tool 3: Admin & Settings UI**:
  - Add / edit / test Qobuz accounts.
  - Add / edit / test Spotify accounts.
  - Set default download directory and naming patterns.

### Phase 7: Verification & Testing
- [ ] Unit tests for Qobuz request signing, bundle scraping regexes, and URL parsers.
- [ ] Unit tests for matcher heuristics with test datasets.
- [ ] End-to-end integration test of the Express backend & Vite frontend.
