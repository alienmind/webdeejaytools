# WebDeeJayTools Architecture & System Design

## 1. Project Intent & Preamble

**WebDeeJayTools** is a specialized, self-contained DJ workflow automation suite designed for maximum portability and zero cloud dependencies. It bridges music streaming ecosystems (Qobuz and Spotify) for DJs, music collectors, and audio enthusiasts.

### Primary Missions
1. **Cross-Service Playlist Synchronization**: Convert, migrate, and sync tracks between Qobuz and Spotify with 4-tier fuzzy matching (ISRC, title/artist heuristics, duration tolerance).
2. **Lossless Audio & Metadata Extraction**: Direct downloading of lossless FLAC (16-bit / 24-bit up to 192kHz) and MP3 320kbps streams with embedded ID3v2 / Vorbis metadata, high-resolution album covers, and `.m3u` playlist generation.
3. **Multi-Account & Credentials Hub**: Unified management of active streaming connections.
4. **USB & Desktop Portability**: Runs either in local browser mode or as a standalone, zero-install portable executable (`.exe`, `.dmg`, `.AppImage`) that can be executed directly from a USB stick with all data and audio kept local.

---

## 2. Reference Lineage & Prior Art

WebDeeJayTools builds upon proven algorithms and reverse-engineering insights from several prior projects of mine:

- **[`qobuz-dj`](https://github.com/alienmind/qobuz-dj)** (Python): Established dynamic web player bundle scraping (`bundle.py`), request signing algorithms, direct audio chunk streaming (`downloader.py`), and filesystem sanitization templates.
- **[`m4l-qobuz-dj`](https://github.com/alienmind/m4l-qobuz-dj)** (TypeScript): Max for Live client port providing TypeScript typings and API signature verification.
- **[`mp3ify`](https://github.com/alienmind/mp3ify)** (Python): Title cleanup heuristics (stripping remaster noise, club mix variants, featured artists) for cross-service search precision.

---

## 3. System Architecture & Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│               Electron Desktop Shell / Browser UI                      │
│  - Frameless dark window (1280x860) / Local Web Browser                │
│  - React 19 Frontend (Tailwind CSS, Lucide Icons, SSE Client)          │
│    ├── Playlist Converter Wizard (Source -> Match -> Target)           │
│    ├── Audio Downloader Queue (Real-time speed & progress)             │
│    └── Admin & Accounts Manager (Connection Hub + Help Modal)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP REST / SSE (http://127.0.0.1:34567)
┌───────────────────────────────────▼────────────────────────────────────┐
│                  Embedded Hono Backend (Node.js)                       │
│  ┌────────────────────────┬─────────────────────────────────────────┐  │
│  │ Qobuz Service          │ Spotify Service                         │  │
│  │ - Bundle Scraper       │ - Web API Client (Client Credentials)   │  │
│  │ - MD5 Request Signer   │ - OAuth Token Resolver                  │  │
│  │ - Direct Stream Writer │ - Playlist Manager & Search             │  │
│  └───────────┬────────────┴────────────────────┬────────────────────┘  │
│              │                                 │                       │
│  ┌───────────▼─────────────────────────────────▼────────────────────┐  │
│  │ 4-Tier Fuzzy Matching Engine (ISRC, Normalized, Levenshtein)     │  │
│  └────────────────────────┬─────────────────────────────────────────┘  │
│                           │                                            │
│  ┌────────────────────────▼─────────────────────────────────────────┐  │
│  │ Downloader & Tagging Engine (node-id3, Vorbis, M3U Generator)   │  │
│  └────────────────────────┬─────────────────────────────────────────┘  │
│                           │                                            │
│  ┌────────────────────────▼─────────────────────────────────────────┐  │
│  │ Local JSON Database (`./data/db.json`)                           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Authentication Architecture

WebDeeJayTools relies on direct, zero-friction authentication by the user using the web browser's and users credentials, some minimal skills are required (ie: opening up DevTools and copying some values).

### Qobuz Authentication
1. **Direct `user_auth_token`**: Users paste their active session token extracted from `https://play.qobuz.com` via DevTools (`F12` $\rightarrow$ Application $\rightarrow$ Cookies $\rightarrow$ `user_auth_token`).
2. **Quick Importer (One-Way cURL / Cookie Parser)**:
   - Users right-click any network request in Chrome DevTools on `play.qobuz.com` $\rightarrow$ **Copy as cURL**.
   - The backend `extractTokenFromInput` parses raw tokens, cookie headers (`user_auth_token=...`), and `x-user-auth-token` headers automatically.
   - The token is validated against `https://www.qobuz.com/api.v0.2/user/get` to confirm active subscription tier (`Studio`, `Sublime`, etc.) and account username.
3. **Dynamic Bundle Scraping & Request Signing (`request_sig`)**:
   - `bundle.ts`: Scrapes the active web player bundle (e.g. `https://play.qobuz.com/resources/8.2.0-b034/bundle.js`) to extract `app_id` and the dynamic Berlin timezone seed secret.
   - `signer.ts`: Signs streaming URL requests (`track/getFileUrl`) conforming to Qobuz API v0.2:
     $$\text{request\_sig} = \text{MD5}\left(\text{endpoint} + \text{sortedParamsExcludingRequestTs} + \text{request\_ts} + \text{seedSecret}\right)$$

### Spotify Authentication
1. **Client Credentials Flow**:
   - Uses Developer App `clientId` and `clientSecret` from developer.spotify.com to obtain application tokens (`https://accounts.spotify.com/api/token`).
   - Used for catalog searches, track metadata, album retrieval, and public playlist reading.
2. **User OAuth Access Token**:
   - Optional Bearer token for writing/modifying private user playlists.

---

## 5. Core Subsystems

### 1. Playlist Converter & Sync Engine (`src/server/services/converter/` & `matcher/`)
- **Input Resolution**: Resolves source URLs into standardized `TrackItem[]` arrays.
- **4-Tier Matching Hierarchy**:
  - **Tier 1 (ISRC Match - 100% Confidence)**: Exact match on International Standard Recording Code.
  - **Tier 2 (Exact Artist + Title)**: Exact string match on normalized metadata.
  - **Tier 3 (Fuzzy String Similarity)**: Strips "(Remastered)", "[Club Mix]", "feat. ...", and computes Levenshtein distance metric ($\le 2$ edit distance).
  - **Tier 4 (Duration Tolerance)**: Compares track durations in seconds ($\pm 3$ seconds score boost, large discrepancies penalized).
- **Execution**: Creates target playlists and batches tracks to avoid API rate limits.

### 2. Audio Downloader & Metadata Engine (`src/server/services/downloader/`)
- **Stream Writer**: Fetches signed audio stream URLs from Qobuz API and pipes them directly to disk.
- **SSE Emission Throttling**: Downloader emits progress updates at $\ge 300\text{ms}$ intervals to prevent Node event loop and SSE buffer exhaustion during high-speed downloads.
- **Metadata Injection**:
  - **FLAC**: Injects standard Vorbis comments and embedded album artwork.
  - **MP3 (320kbps)**: Injects ID3v2 tags (`TIT2`, `TPE1`, `TALB`, `TYER`, `TRCK`) and embedded APIC cover art via `node-id3`.
- **Formatting Templates**: Generates directories according to templates (e.g. `{artist} - {album} ({year})/{trackNumber} - {title}.flac`).
- **M3U Generator**: Automatically creates UTF-8 `.m3u` / `.m3u8` playlist files in the downloaded album directory.

### 3. Local Persistence (`src/server/db/store.ts`)
- Zero-native-dependency JSON store (`./data/db.json`).
- Stores accounts, default download directories, preferred audio qualities, and naming templates.
- Directory paths are relative to application root, making configuration and data completely portable.

---

## 6. Desktop Packaging & Portability (Electron)

WebDeeJayTools can be run in two modes:
1. **Web Dev Server**: `pnpm dev` launches Vite + Hono on `http://localhost:5173`.
2. **Portable Desktop Application**:
   - Packaged with **Electron** and **electron-builder**.
   - `dist/` (React UI) + `dist-electron/` (Hono Server + Electron Window) are bundled into standalone binaries.
   - **Windows Portable**: `release/WebDeeJayTOOLS-Portable-v0.1.0.exe` runs directly off any USB drive without installation.
   - **macOS**: `release/WebDeeJayTOOLS-mac-v0.1.0.dmg`.
   - **Linux**: `release/WebDeeJayTOOLS-linux-v0.1.0.AppImage`.
