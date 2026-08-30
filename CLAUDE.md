# CLAUDE.md - working rules for agents in this repo

This repo builds `webdeejaytools`, a local TypeScript web application and toolset for DJ automations (playlist conversion/import/export across Spotify and Qobuz, audio downloading with metadata tagging, and account/credential administration).

Start with `README.md`, then `doc/PLAN.md` for the staged plan, and `doc/ARCHITECTURE.md` for system design.

## Technical Stack & Architecture Rules

- **Frontend**: React 18+, Vite, TypeScript, Tailwind CSS, Lucide React icons.
- **Backend**: Node.js, Express, TypeScript, Server-Sent Events (SSE) for streaming progress.
- **Audio & Tagging**: Native streams for downloads, `node-id3` / `music-metadata` for ID3 tags, Vorbis comments for FLAC.
- **State & Storage**: Local JSON storage in `data/db.json` for accounts and settings. No raw credentials committed to git.
- **API Security**:
  - Qobuz API: App ID and secrets scraped dynamically client-side/server-side from `play.qobuz.com` bundle. Never hardcoded or committed.
  - Spotify API: Standard OAuth / PKCE or App Credentials stored locally.

## Project Structure

- `src/shared/` - Shared types, schemas, and pure utility functions.
- `src/server/` - Node.js Express server, service adapters (Qobuz, Spotify, Matcher, Downloader).
- `src/client/` - React frontend with sidebar navigation and tool views.
- `doc/` - Documentation (`PLAN.md`, `ARCHITECTURE.md`, `TODO.md`).

## Verification & Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start Vite dev server and backend API
pnpm build            # Build frontend and server bundles
pnpm test             # Run unit tests (Vitest)
```

## Writing & Coding Style

- Plain ASCII punctuation everywhere.
- No LLM filler preambles or puffy adjectives.
- Comments explain constraints, traps, or API quirks, not obvious lines of code.
