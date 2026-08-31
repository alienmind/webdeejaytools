# WebDeeJayTools Architecture & System Design

## 1. Project Intent & Preamble

**WebDeeJayTools** is a specialized, self-contained DJ workflow automation suite designed for maximum portability and zero cloud dependencies. It bridges music streaming ecosystems (Qobuz and Spotify) for DJs, music collectors, and audio enthusiasts.

### Primary Missions
1. **Cross-Service Playlist Synchronization**: Convert, migrate, and sync tracks between Qobuz and Spotify with 4-tier fuzzy matching (ISRC, title/artist heuristics, duration tolerance).
2. **Lossless Audio & Metadata Extraction**: Direct downloading of lossless FLAC (16-bit / 24-bit up to 192kHz) and MP3 320kbps streams with embedded ID3v2 / Vorbis metadata, high-resolution album covers, and `.m3u` playlist generation.
3. **Multi-Account & Credentials Hub**: Unified management of active streaming connections.
4. **USB & Desktop Portability**: Runs either in local browser mode or as a standalone, zero-install portable executable (`.exe`, `.dmg`, `.AppImage`) that can be executed directly from a USB stick with all data and audio kept local.

---

> **Where things are documented.** This file covers project intent, subsystem topology, and
> authentication. `ARCHITECTURE.md` at the repository root covers the DSP and MIR algorithms, the
> tagging and disk-safety model, the security model, and the numbered design-decision record.
> `doc/IMPROVEMENTS.md` holds the architecture review that produced the Phase 7b hardening pass and
> a record of what was implemented, changed shape, or deliberately deferred.

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

> Note: Playwright-driven browser login and local browser-session auto-detection have been removed. Their implementations had already been reduced to functions that only threw, while keeping three heavyweight browser-automation packages in the dependency tree.

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
- **Metadata Injection** (`src/server/services/tagging/`):
  - **FLAC**: Vorbis comments and a `PICTURE` block, written by the project's own FLAC metadata writer. `node-id3` is deliberately not used here - it writes an ID3v2 container, which is invalid in FLAC and invisible to Rekordbox and Serato.
  - **MP3 / WAV / AIFF**: ID3v2 tags (`TIT2`, `TPE1`, `TALB`, `TYER`, `TRCK`, `TBPM`, `TKEY`) and embedded APIC cover art via `node-id3`.
  - **Unsupported containers**: the write is refused and reported as a failure, rather than returning success for a write that did nothing.
  - **Every write is two-phase**: copy, mutate the copy, re-parse and verify it, then atomically swap. A rejected write leaves the original byte-identical. See `services/tagging/safeWrite.ts`.
- **Formatting Templates**: Generates directories according to templates (e.g. `{artist} - {album} ({year})/{trackNumber} - {title}.flac`).
- **M3U Generator**: Automatically creates UTF-8 `.m3u` / `.m3u8` playlist files in the downloaded album directory.

### 3. Local Persistence (`src/server/db/store.ts`)
- Zero-native-dependency JSON store (`./data/db.json`).
- Stores accounts, default download directories, preferred audio qualities, and naming templates.
- Directory paths are relative to application root, making configuration and data completely portable.
- Writes go temp-file-then-rename with a Windows retry. The file is never unlinked first.
- **Credentials are stored unencrypted.** This is a deliberate trade for a portable tool - an OS keychain does not travel on a USB stick - so treat the drive itself as a credential. They are never sent to the client: `GET /api/accounts` returns presence flags and hints only (`src/server/util/redact.ts`).

### 4. Local Server Security Model

The embedded server holds full filesystem authority on a fixed loopback port, and is reachable by any page loaded in any browser on the machine. Three controls follow from that:

- **Path containment** (`src/server/util/paths.ts`): every caller-supplied path must resolve inside an allowed root - the configured library and download directories, plus directories the user picked or scanned this session. Containment is checked with `path.relative`, not a string prefix, and symlink targets are re-checked. Without it, `/api/mp3/stream?path=...` is an arbitrary file read and `/api/mp3/delete` an arbitrary unlink.
- **Loopback guard** (`src/server/middleware/localGuard.ts`): a `Host` allow-list defeats DNS rebinding, an `Origin` allow-list defeats cross-origin requests (which is what actually protects the simple `GET` routes, since those never trigger a CORS preflight), and the packaged build additionally requires a per-launch session token on every mutating request.
- **Schema validation** (`src/shared/schemas.ts`): every body and query is parsed with zod at the route boundary.

The Electron shell runs the renderer with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`, under a CSP that permits only same-origin resources plus remote cover art. The native folder dialog is used instead of shelling out to PowerShell, `osascript`, or `zenity`.

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
