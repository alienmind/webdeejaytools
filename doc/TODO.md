# Active Task Ledger

## Current Status: Building Phase (React 19)

> **Note**: Migrated to React 19 (`react@^19.0.0`, `react-dom@^19.0.0`).

### Stage 1: Backend Foundation
- [x] Implement local database store (`src/server/db/store.ts`) for accounts and settings.
- [x] Port Qobuz bundle scraper, signer, and client (`src/server/services/qobuz/`).
- [x] Implement Spotify API client (`src/server/services/spotify/`).
- [x] Write unit tests for Qobuz signer, bundle parser, and store.

### Stage 2: Matching Engine & Conversion Pipeline
- [x] Implement track normalization and fuzzy matcher (`src/server/services/matcher/`).
- [x] Implement conversion coordinator (fetch source -> match target -> write playlist).

### Stage 3: Downloader Engine
- [x] Implement streaming file downloader with SSE progress.
- [x] Implement ID3 / FLAC metadata tagging and cover art embedding.
- [x] Implement M3U generation and filename sanitization.

### Stage 4: Frontend UI (React 19)
- [x] Setup Tailwind CSS layout with dark theme and vertical sidebar.
- [x] Build Admin Panel (Account credential manager & settings).
- [x] Build Playlist Converter wizard.
- [x] Build Downloader view with live progress queue.
- [x] Verification and end-to-end testing.
