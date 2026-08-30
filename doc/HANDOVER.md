# Agent Handover: WebDeeJayTools

## Context & Objective
`webdeejaytools` is a local fullstack TypeScript application for DJ automation workflows located at `C:\Users\jaime\src\webdeejaytools`.

### Core Toolset
1. **Tool 1 (Playlist Converter / Sync)**: Cross-service sync between Qobuz and Spotify. Input URL -> Preview tracks -> Select source/target accounts -> Select or create target playlist -> Multi-tier fuzzy matching (ISRC, title/artist cleanups, duration tolerance) -> Execute & report hits/misses.
2. **Tool 2 (Audio Downloader)**: Download tracks, albums, or playlists locally via Qobuz API (MP3 320 / FLAC 16/24-bit), write ID3v2/Vorbis tags, embed album art, format filenames, and generate `.m3u` playlists.
3. **Tool 3 (Admin & Accounts)**: Multi-account credentials management (Qobuz dynamic bundle scraping for app ID & secrets + user auth; Spotify OAuth/Client credentials) and global app settings.

---

## Reference Projects Analyzed
- `C:\Users\jaime\src\qobuz-dj`: Python implementation with Qobuz bundle scraping (`bundle.py`), request signing (`qopy.py`), downloading (`downloader.py`), and metadata sanitization (`utils.py`).
- `C:\Users\jaime\src\m4l-qobuz-dj`: TypeScript port of Qobuz API client (`src/app/dj/qobuz/client.ts`, `sign.ts`).
- `C:\Users\jaime\src\craigscrapper`: Local fullstack architecture (Node.js/Express backend + Vite/React frontend + SSE streaming for real-time logs and progress).
- `C:\Users\jaime\src\mp3ify`: Python Spotify search and track query heuristics (`search_query_spotify`, title cleanup).

---

## Current State of the Codebase
- **Scaffolded**:
  - `package.json`, `tsconfig.json`, `vite.config.ts`, `README.md`, `CLAUDE.md`.
  - Documentation: `doc/PLAN.md`, `doc/ARCHITECTURE.md`, `doc/TODO.md`.
  - Domain models: `src/shared/types.ts`.

---

## Next Steps for the Incoming Agent
1. **Install dependencies**: Run `pnpm install` in `C:\Users\jaime\src\webdeejaytools`.
2. **Implement Backend Services**:
   - `src/server/db/store.ts`: Local JSON database for accounts, settings, and download history.
   - `src/server/services/qobuz/`: Bundle scraper, request signer (`sign.ts`), API client (`client.ts`), and stream resolver.
   - `src/server/services/spotify/`: Spotify Web API client for track/playlist resolution and creation.
   - `src/server/services/matcher/`: Track matching algorithm (ISRC -> exact title/artist -> normalized Levenshtein distance -> duration check).
   - `src/server/services/downloader/`: Streaming file writer, `node-id3` tagging, Vorbis tagging, M3U generation.
3. **Build Express API & SSE Handler** (`src/server/index.ts` & `src/server/routes/`).
4. **Build React UI** (`src/client/`):
   - Sidebar navigation with Tool 1, Tool 2, and Tool 3 (Admin pinned to bottom).
   - Step-by-step Playlist Converter wizard.
   - Downloader queue with live SSE progress bars.
   - Admin panel for managing Qobuz and Spotify accounts.
5. **Verify**:
   - Run unit tests with `pnpm test` (vitest).
   - Verify dev server runs cleanly with `pnpm dev`.
