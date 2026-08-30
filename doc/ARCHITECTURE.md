# Architecture & System Design

## 1. System Topology

```
┌────────────────────────────────────────────────────────┐
│               Frontend (React 18 + Vite)               │
│  - Sidebar Navigation: [Converter] [Downloader] [⚙]    │
│  - Converter Wizard / Live Matching Table UI           │
│  - Downloader Queue & Progress Displays                │
│  - Admin & Accounts Settings UI                        │
└───────────────────────────┬────────────────────────────┘
                            │ REST / SSE
┌───────────────────────────▼────────────────────────────┐
│              Backend (Node.js + Express)               │
│  ┌───────────────┬────────────────┬─────────────────┐  │
│  │ Qobuz Service │ Spotify Client │ Matching Engine │  │
│  └───────┬───────┴────────┬───────┴────────┬────────┘  │
│          │                │                │           │
│  ┌───────▼────────────────▼────────────────▼────────┐  │
│  │ Downloader (Streams, ID3v2/Vorbis, M3U Gen)     │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           │                            │
│  ┌────────────────────────▼─────────────────────────┐  │
│  │ Local JSON Database (`data/db.json`)             │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

## 2. Service Adapters

### Qobuz Service (`server/services/qobuz/`)
- **Bundle Scraper**: Resolves `https://play.qobuz.com/login`, parses bundle URLs, and derives `app_id` and timezone secrets dynamically using regex parsing and base64 decode without hardcoded secrets.
- **Request Signer**: Pure MD5 request hasher for `getFileUrl` and `getUserFavorites` conforming to Qobuz API v0.2.
- **Client**: Handles `user/login`, track/album/playlist retrieval, catalog searches, and playlist creation/modification.

### Spotify Service (`server/services/spotify/`)
- **Web API Client**: Supports Client Credentials and OAuth Access Tokens.
- **Catalog Resolver**: Resolves track, album, and playlist URLs and fetches paginated items.
- **Playlist Manager**: Fetches user playlists and writes tracks to target playlists.

### Matching Engine (`server/services/matcher/`)
- **Tier 1 (ISRC)**: If both source and target catalog entries expose an ISRC code, match with 100% confidence.
- **Tier 2 (Exact & Normalized Title/Artist)**: Strips "(Remastered)", "[Club Mix]", "Original Mix", "feat. ...", and computes string similarity (Levenshtein distance).
- **Tier 3 (Duration Verification)**: Compares track durations in seconds ($\pm 3$ seconds score boost, large discrepancies penalized).

### Downloader & Tagging Engine (`server/services/downloader/`)
- Direct streaming of Qobuz audio files to local disk.
- Writing ID3 tags to MP3 files (Artist, Title, Album, Year, Track Number, Embedded APIC Cover Art).
- Writing Vorbis tags to FLAC files.
- Sanitizing file paths using safe OS characters.
- Generating `.m3u` playlists for completed folders.
