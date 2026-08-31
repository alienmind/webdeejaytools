# CLAUDE.md - working rules for agents in this repo

This repo builds `webdeejaytools`, a local TypeScript web application and toolset for DJ automations (playlist conversion/import/export across Spotify and Qobuz, audio downloading with metadata tagging, and account/credential administration).

Start with `README.md`, then `doc/PLAN.md` for the staged plan, and `doc/ARCHITECTURE.md` for system design.

## Technical Stack & Architecture Rules

- **Frontend**: React 18+, Vite, TypeScript, Tailwind CSS, Lucide React icons.
- **Backend**: Node.js, Hono, TypeScript, Server-Sent Events (SSE) for streaming progress.
- **Audio & Tagging**: Native streams for downloads. `node-id3` writes ID3 (MP3/WAV/AIFF); FLAC uses the project's own Vorbis comment writer in `src/server/services/tagging/flac.ts` - never `node-id3`, which would prepend an ID3 blob that is invalid in a FLAC container.
- **Tag writes are two-phase**: everything goes through `safeReplaceFile`, which copies, mutates the copy, re-parses and verifies it, and only then swaps it over the original. Never write tags to a user's file in place.
- **State & Storage**: Local JSON storage in `data/db.json` for accounts and settings. No raw credentials committed to git, and credentials are never returned over the API - see `src/server/util/redact.ts`.
- **Heavy DSP runs in `worker_threads`** via `src/server/services/mp3/analysisPool.ts`, never on the request thread.
- **API Security**:
  - **Every filesystem path that crosses the API boundary must pass `assertAllowedPath`** (`src/server/util/paths.ts`). The server holds full filesystem authority on a fixed loopback port and is reachable from any page in any browser on the machine; an unvalidated path parameter is an arbitrary file read, write, or unlink.
  - **Every request body and query must be parsed with a zod schema** from `src/shared/schemas.ts`. A TypeScript cast proves nothing about runtime data.
  - Never build a shell command string from request data. Use `execFile` with an argument array, or the Electron native dialog.
  - Qobuz API: App ID and secrets scraped dynamically client-side/server-side from `play.qobuz.com` bundle. Never hardcoded or committed.
  - Spotify API: Standard OAuth / PKCE or App Credentials stored locally.

## Project Structure

- `src/shared/` - Shared types (`types.ts`), zod request schemas (`schemas.ts`), and pure utility functions.
- `src/server/` - Node.js Express server, service adapters (Qobuz, Spotify, Matcher, Downloader).
- `src/client/` - React frontend with sidebar navigation and tool views.
- `doc/` - Documentation (`PLAN.md`, `ARCHITECTURE.md`, `IMPROVEMENTS.md`).

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
