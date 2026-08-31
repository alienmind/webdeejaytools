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

## 3. Future Roadmap & Backlog

### Phase 8: Extended Streaming & DJ Integrations
- [ ] **Rekordbox / Traktor / Serato Exporter**: Export converted playlists directly as Rekordbox XML or Traktor NML files.
- [ ] **BPM & Key Pre-Analysis**: Optional audio analysis for key detection and BPM calculation during download.
- [ ] **Batch Playlist Converter**: Convert multiple playlists in a single batch queue.
- [ ] **Tidal Service Adapter**: Add Tidal service integration for 3-way cross-service conversion (Spotify $\leftrightarrow$ Qobuz $\leftrightarrow$ Tidal).
- [ ] **Auto-Updater**: Configure automatic update checks for the portable desktop application.
