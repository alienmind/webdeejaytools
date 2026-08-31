# WebDeeJayTools Implementation & Roadmap Plan

## 1. Vision & Goals

**WebDeeJayTools** is a specialized, self-contained DJ workflow automation suite designed for maximum portability and zero cloud dependencies. It provides a sleek, modern dark-themed interface with three core modules:

1. **Tool 1: Playlist Converter**
   - Cross-service sync between Qobuz and Spotify.
   - Paste any source track, album, or playlist URL from Spotify or Qobuz.
   - Auto-detect source service and preview tracklist with cover art.
   - Select target service & account.
   - Choose an existing playlist or create a new playlist dynamically.
   - 4-Tier fuzzy matching (ISRC, title/artist heuristics, duration tolerance).
   - Display match outcomes (hits, misses, confidence scores, and match percentage).
   - Add matched tracks to target playlist with progress indication.

2. **Tool 2: Audio Downloader**
   - Download individual tracks, albums, or playlists directly to local disk.
   - Support MP3 320kbps and lossless FLAC (16/44.1, 24/96, 24/192) via Qobuz streaming API.
   - Embed high-resolution album artwork into audio files.
   - Write standard ID3v2 tags (MP3) and Vorbis comments (FLAC).
   - Sanitize directory and track names with customizable templates (`{artist} - {album} ({year})`, etc.).
   - Automatically generate `.m3u` playlists for downloaded folders.
   - Live download queue with throttled SSE progress, speed, and status displays.

3. **Tool 3: Admin & Accounts Panel**
   - Manage multiple active connections for Qobuz and Spotify.
   - In-place account editing (Pencil button) and testing.
   - Direct `user_auth_token` editing + one-way cURL / Cookie Quick Importer.
   - Interactive visual guide modal (`? How to get token?`) with DevTools screenshots.
   - Direct link to `play.qobuz.com`.
   - Global application settings (download paths, default audio quality, filename formats).

---

## 2. Implemented Features & Current Status

### Phase 1: Project Scaffolding & Foundation
- [x] Fullstack TypeScript project configuration (`package.json`, `tsconfig.json`, `vite.config.ts`).
- [x] Tailwind CSS dark DJ aesthetic with responsive vertical sidebar.
- [x] Shared TypeScript interfaces in `src/shared/types.ts` (`Account`, `TrackItem`, `TrackMatch`, `AppSettings`, `QualityId`).
- [x] Pure JSON database persistence in `src/server/db/store.ts` (`./data/db.json`) with zero native C++ dependencies.

### Phase 2: Qobuz Service & Reverse-Engineered Algorithms
- [x] **Bundle Scraper**: Dynamically extracts `app_id` and Berlin timezone seed secret (`abb21364945c0583309667d13ca3d93a`) from `play.qobuz.com/resources/.../bundle.js`.
- [x] **Request Signer**: Exact MD5 request signature algorithm conforming to Qobuz API v0.2.
- [x] **API Client**: Handles URL parsing, track/album/playlist retrieval, catalog searches, user favorites, and playlist creation.
- [x] **Authentication**: Direct `user_auth_token` input, one-way DevTools cURL/Cookie parsing, and token verification via `/user/get`.

### Phase 3: Spotify Service
- [x] **Spotify Web API Client**: Client Credentials Flow for catalog searches, album retrieval, and public playlists.
- [x] **OAuth Token Support**: Bearer token support for user playlist creation and modification.
- [x] **URL Parser**: Seamless resolution of `open.spotify.com` track, album, and playlist URLs.

### Phase 4: Track Matching Engine
- [x] **Tier 1 (ISRC Match)**: 100% confidence match using International Standard Recording Codes.
- [x] **Tier 2 (Exact Artist + Title)**: Exact string match on normalized metadata.
- [x] **Tier 3 (Fuzzy String Similarity)**: Strips "(Remastered)", "[Club Mix]", "feat. ...", and computes Levenshtein distance ($\le 2$).
- [x] **Tier 4 (Duration Tolerance)**: Compares track durations in seconds ($\pm 3$ seconds score boost, $> 30$ seconds penalty).
- [x] Diagnostic outcome breakdown (hits, misses, confidence scores, and match percentage).

### Phase 5: Downloader Engine & Metadata Tagging
- [x] Direct streaming of signed Qobuz audio URLs to local disk.
- [x] SSE emission throttling ($\ge 300\text{ms}$) to prevent Node event loop and memory exhaustion.
- [x] ID3v2 tagging for MP3 320kbps files with embedded cover art.
- [x] Vorbis comments and metadata tagging for FLAC files.
- [x] Customizable folder and filename formatting templates.
- [x] Automatic `.m3u` playlist generation for downloaded albums and playlists.

### Phase 6: Frontend UI (React 19)
- [x] Sidebar navigation with aligned module titles: **Playlist Converter**, **Audio Downloader**, and **Admin & Accounts**.
- [x] Step-by-step Playlist Converter wizard with live fuzzy matching results table.
- [x] Downloader view with real-time SSE progress, download speed, and queue controls.
- [x] Admin panel with connection cards, test buttons, and in-place credential editing.
- [x] Interactive visual help modal (`? How to get token?`) with DevTools screenshots.
- [x] Direct external link to `play.qobuz.com`.

### Phase 7: Desktop Packaging & Portability (Electron)
- [x] Embedded Hono backend server + Electron BrowserWindow launcher (`electron/main.ts`).
- [x] Electron build configuration with Vite (`vite.electron.config.ts`).
- [x] `electron-builder` configuration for portable builds (`electron-builder.json`):
  - `pnpm run dist:win` $\rightarrow$ **Portable Windows `.exe`** (runs directly from USB drive) & NSIS installer.
  - `pnpm run dist:mac` $\rightarrow$ **macOS `.dmg`** & `.zip`.
  - `pnpm run dist:linux` $\rightarrow$ **Linux `.AppImage`** & `.tar.gz`.
- [x] Relative `./data` and `./downloads` directories for zero-install USB flash drive portability.

---

### Phase 7b: Hardening & Architecture Pass (completed)
- [x] Filesystem containment guard on every path crossing the API boundary (`util/paths.ts`) + route-level regression tests.
- [x] Loopback `Host`/`Origin` guard and per-launch session token (`middleware/localGuard.ts`).
- [x] Native Electron folder dialog; no shell command strings built from request data.
- [x] zod request schemas at every route boundary (`shared/schemas.ts`).
- [x] Credentials redacted from all API responses (`util/redact.ts`).
- [x] Real FLAC Vorbis comment writer, replacing invalid ID3-on-FLAC; repairs previously damaged files.
- [x] Two-phase verified tag writes: copy, mutate, verify, atomic swap (`tagging/safeWrite.ts`).
- [x] Analysis moved into a `worker_threads` pool with cancellable jobs; no more event-loop blocking.
- [x] BPM/key return `null` on failure; low-confidence results are never written to disk.
- [x] Bitrate-aware read window so hi-res FLAC gets the same amount of audio to analyse as MP3.
- [x] `db.json` write no longer unlinks before rename; DJ set discovery batched into one persist.
- [x] Frontend: hash router with lazy routes, error boundary, toast layer, app-data context.
- [x] MP3 view decomposed into hooks (`useLibrary`, `useAudioPreview`, `useAnalysis`, `useDjSets`) plus a `TrackTable` component.
- [x] Responsive pass: sidebar drawer below `md`, card list instead of a 12-column table, dnd-kit reordering that works on touch.
- [x] Self-hosted fonts; dead Playwright/Puppeteer dependencies removed.

### Phase 8: Extended DJ Workflow & Library Management

- **Local MP3 Collection Management**:
  - [x] Library scanning and recursive folder indexing (`services/mp3/scanner.ts`).
  - [x] Audio preview with HTTP range streaming, filtering, sorting, pagination.
  - [x] DJ set flattening (move/copy, cross-drive `EXDEV` fallback, empty-folder cleanup).
  - [x] Physical deletion with containment guarding.
  - [ ] Identification of duplicate audio tracks and bitrate anomalies.
  - [ ] Batch in-place ID3v2/Vorbis tag editing from the UI (the write path exists in
        `services/tagging/`; the editor UI does not).

- **Automatic BPM and Key Detection**:
  - [x] Fast audio signal analysis to compute tempo (BPM) - bandpass envelope autocorrelation.
  - [x] Harmonic key detection (standard notation & Camelot / Open Key wheels) - Radix-2 FFT
        chromagram with Krumhansl-Kessler correlation.
  - [x] Direct embedding of BPM & Key tags into ID3 (MP3/WAV/AIFF) and Vorbis (FLAC) headers.
  - [x] Multi-core `worker_threads` execution with cancellable jobs and live SSE progress.
  - [x] Confidence gating: a low-confidence detection is displayed but never written to disk.
  - [ ] Beat-grid / first-downbeat detection (needed for true CDJ grid export).

- **Automatic Playlist Building (Genres, Styles & Moods)**:
  - [x] Harmonic playlist sequencing (Camelot wheel compatible progressions, BPM energy curves).
  - [x] Export to M3U8, M3U, Rekordbox XML, CSV/TXT, and JSON.
  - [ ] Smart playlist generation based on genre classification, energy levels, and mood profiles.
  - [ ] Traktor NML export.
  - [ ] Direct export to streaming targets.

- [ ] **Tidal Service Adapter**: 3-way cross-service conversion (Spotify $\leftrightarrow$ Qobuz $\leftrightarrow$ Tidal).
      The adapter/registry seam in `services/base/` is ready for this: a new folder plus one
      registry line.
- [ ] **Auto-Updater**: Automatic update checks for the portable desktop application.

### Phase 9: Carried Forward from the Architecture Review & Active Backlog

- [x] **Complete Modal Markup Decomposition**: Extracted all modals in `pages/Mp3Management/` (`DjSetModal`, `DeleteModal`, `SmartReorderModal`, `ExportPlaylistModal`, `AnalyzeModal`, `AudioPreviewBar`) into dedicated subcomponents, reducing `index.tsx` to ~1,000 lines.
- [ ] **Queue Unification**: Consolidate `DownloadQueue` (downloader) and `AnalysisQueue` (analyzer) under a unified `JobQueue<T>` abstraction with standardized SSE streaming, pause/resume, cancel-by-id, and restart persistence (planned for Phase 8).
- [ ] **Read-Only / Protected Volume UX Feedback**: Surface explicit, actionable "Volume is Read-Only / Write-Protected" toast notifications when `EACCES`, `EROFS`, or `EPERM` is encountered on hardware-locked USB drives.
- [ ] **Optional passphrase-derived encryption** for `data/db.json` (`scrypt` + `AES-256-GCM`, both in Node core).
- [ ] **Library Index Isolation**: Move the library index out of `db.json` into its own file before collections scale to 10k+ tracks.

