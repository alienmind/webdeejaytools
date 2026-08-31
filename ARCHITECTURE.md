# System Architecture & Algorithmics — WebDeeJayTOOLS 🎧

`webdeejaytools` is a specialized, self-contained DJ workflow automation suite and lossless audio manager. It is designed to run both as a local web application and as a zero-install portable desktop executable (`.exe`, `.dmg`, `.AppImage`) that can operate directly off a DJ USB flash drive with local data persistence.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Client Layer (React 19 + Vite)                     │
│  - MP3 / Lossless Library Management                                    │
│  - Interactive Camelot Wheel Visualizer Modal (SVG Vector)              │
│  - Smart Harmonic Tracklist Reorder (Drag & Drop + Optimizers)          │
│  - In-Browser Low-Latency Audio Preview Player (HTTP 206 Range Stream)  │
│  - Universal DJ Playlist Exporter (M3U8, M3U, Rekordbox XML, CSV, JSON) │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Async REST / SSE
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Server Layer (Hono on Node.js 22)                    │
│  - Route Handlers: /api/mp3, /api/settings, /api/auth, /api/convert     │
│  - Zero-Native Audio DSP Engine in a worker_threads pool (BPM & Key)    │
│  - Tag Management (ID3 TBPM/TKEY & FLAC Vorbis metadata persistence)   │
│  - DJ Set Creator (Atomic cross-drive flattening & empty folder cleaner)│
│  - JSON Database Store (`./data/db.json` with Windows lock safety)      │
│  - Loopback guard: Host/Origin allow-list + per-launch session token    │
│  - Path containment guard on every caller-supplied filesystem path      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Desktop Shell (Electron 44)                         │
│  - Native File & Folder Dialog Picker (`dialog.showOpenDialog`)         │
│  - Portable USB Base Directory Detection (`PORTABLE_EXECUTABLE_DIR`)    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Audio DSP & Music Information Retrieval (MIR) Algorithms

All heavy CPU-bound audio signal processing is executed on the **Node.js backend** to enable direct file access and direct metadata tag writing without network overhead.

Analysis runs in a **`worker_threads` pool** (`src/server/services/mp3/analysisPool.ts`), sized `min(4, cores - 1)`. This is what makes the multi-core claim real: running the decode, filter, autocorrelation, and FFT stages on the request thread previously froze the entire server for the duration of a batch - no artwork, no preview streaming, not even an SSE heartbeat. Batches are dispatched as cancellable jobs (`analysisQueue.ts`), so the work also survives a page reload. Where the worker script is unavailable (the Vite dev server), the pool degrades to in-process execution that yields between tracks.

---

### A. BPM / Tempo Detection (Bandpass Envelope Autocorrelation)

Located in `src/server/services/mp3/analyzer.ts`.

#### 1. Low-Pass Biquad Butterworth Filter
To isolate rhythmic transients (kick drums and bass fundamentals) while filtering out polyphonic chord clutter and high-frequency noise, a 2nd-order IIR Butterworth low-pass filter ($f_c \approx 135\text{ Hz}$) is applied:

$$y[n] = b_0 x[n] + b_1 x[n-1] + b_2 x[n-2] + a_1 y[n-1] + a_2 y[n-2]$$

where:
$$\theta_c = \frac{\pi f_c}{F_s}, \quad \text{ita} = \frac{1}{\tan(\theta_c)}, \quad q = \sqrt{2}$$
$$b_0 = \frac{1}{1 + q \cdot \text{ita} + \text{ita}^2}, \quad b_1 = 2 b_0, \quad b_2 = b_0$$
$$a_1 = 2(\text{ita}^2 - 1)b_0, \quad a_2 = -(1 - q \cdot \text{ita} + \text{ita}^2)b_0$$

#### 2. Energy Envelope & Onset Strength Extraction
The filtered signal is segmented into overlapping windows of size $W = 512$ samples with a hop size $H = 128$ samples. The Root Mean Square (RMS) energy envelope is computed:

$$E[k] = \sqrt{\frac{1}{W} \sum_{m=0}^{W-1} y[k \cdot H + m]^2}$$

The first-order positive difference (half-wave rectified onset detection function) captures transient strike points:

$$D[k] = \max(0, E[k] - E[k-1])$$

#### 3. Autocorrelation over Tempo Lag Intervals
Given the envelope sampling rate $F_e = \frac{F_s}{H}$, autocorrelation is evaluated over the plausible tempo range ($65\text{ BPM} \le \text{BPM} \le 195\text{ BPM}$):

$$\text{ACF}(\tau) = \frac{1}{N - \tau} \sum_{k=0}^{N - \tau - 1} D[k] \cdot D[k + \tau]$$

where the lag $\tau$ is related to tempo by:

$$\tau = \text{round}\left(\frac{60 \cdot F_e}{\text{BPM}}\right)$$

#### 4. Harmonic Octave Disambiguation
Electronic music with half-time snare patterns (e.g. Dubstep, Trap) or 4-on-the-floor kicks can generate subharmonic peaks (e.g. 64 BPM vs 128 BPM). The analyzer detects subharmonics and performs octave correction to normalize tempos to standard dance ranges ($90 - 180\text{ BPM}$).

---

### B. Musical Key & Camelot Detection (Krumhansl-Schmuckler Algorithm)

Located in `src/server/services/mp3/analyzer.ts` and `src/shared/harmonic.ts`.

#### 1. Fast Radix-2 Cooley-Tukey FFT & Chromagram (PCP)
A custom, pre-computed Radix-2 Cooley-Tukey decimation-in-time Fast Fourier Transform ($N = 2048$) with trigonometric twiddle lookup tables and bit-reversal indexing is executed across overlapping Hann frames ($H = 1024$). This accelerates the STFT step by over **400x** compared to discrete Fourier transformations ($O(N \log N)$ vs $O(N^2)$).

For each frequency bin $k$ within the musical pitch range ($65\text{ Hz} \le f_k \le 2500\text{ Hz}$), the frequency is converted to continuous MIDI note numbers:

$$\text{MIDI}(f_k) = 69 + 12 \log_2\left(\frac{f_k}{440}\right)$$

Each frequency magnitude $|X(k)|$ is accumulated into its corresponding 12-semitone pitch class bin ($C, C\sharp, D, D\sharp, E, F, F\sharp, G, G\sharp, A, A\sharp, B$):

$$\text{PitchClass}(f_k) = (\text{round}(\text{MIDI}(f_k)) \bmod 12 + 12) \bmod 12$$

The resulting 12-element Pitch Class Profile (Chromagram) vector $\mathbf{v} \in \mathbb{R}^{12}$ is normalized:

$$\hat{v}_i = \frac{v_i}{\sum_{j=0}^{11} v_j}$$

#### 2. Krumhansl-Kessler Probe Tone Correlation
The normalized chromagram is correlated against the 24 standard Krumhansl-Kessler tonal hierarchy profiles (12 Major and 12 Minor) using the **Pearson correlation coefficient**:

$$r(\mathbf{x}, \mathbf{y}) = \frac{\sum_{i=0}^{11} (x_i - \bar{x})(y_i - \bar{y})}{\sqrt{\sum_{i=0}^{11}(x_i - \bar{x})^2 \cdot \sum_{i=0}^{11}(y_i - \bar{y})^2}}$$

- **Major Profile Template**: `[6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]`
- **Minor Profile Template**: `[6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]`

The key profile $k \in [0..23]$ yielding the maximum correlation $r_{\max}$ is identified as the root tonality.

#### 3. Camelot Wheel Key Mapping Table
The detected musical key is mapped to the standard 24-position Camelot Mixing Wheel:

| Musical Key | Camelot Code | Musical Key | Camelot Code |
| :--- | :--- | :--- | :--- |
| **A♭ Minor / G♯ Minor** | `1A` | **B Major** | `1B` |
| **E♭ Minor / D♯ Minor** | `2A` | **F♯ Major / G♭ Major** | `2B` |
| **B♭ Minor / A♯ Minor** | `3A` | **D♭ Major / C♯ Major** | `3B` |
| **F Minor** | `4A` | **A♭ Major** | `4B` |
| **C Minor** | `5A` | **E♭ Major** | `5B` |
| **G Minor** | `6A` | **B♭ Major** | `6B` |
| **D Minor** | `7A` | **F Major** | `7B` |
| **A Minor** | `8A` | **C Major** | `8B` |
| **E Minor** | `9A` | **G Major** | `9B` |
| **B Minor** | `10A` | **D Major** | `10B` |
| **F♯ Minor / G♭ Minor** | `11A` | **A Major** | `11B` |
| **C♯ Minor / D♭ Minor** | `12A` | **E Major** | `12B` |

---

### C. Harmonic DJ Sequence Optimization

Located in `src/shared/harmonic.ts`.

When executing a **Smart DJ Set Reorder**, the engine uses dynamic graph optimization to produce harmonic transitions and smooth energy curves:

1. **Camelot Cyclic Step Distance**:
   $$\Delta_{\text{num}} = \min(|n_1 - n_2|, 12 - |n_1 - n_2|)$$
2. **Transition Classifications**:
   - **Exact Key** ($\Delta_{\text{num}} = 0, \text{mode}_1 = \text{mode}_2$): Weight = $10.0$
   - **Relative Major/Minor** ($\Delta_{\text{num}} = 0, \text{mode}_1 \ne \text{mode}_2$): Weight = $8.5$
   - **Adjacent Step** ($\Delta_{\text{num}} = 1, \text{mode}_1 = \text{mode}_2$): Weight = $7.0$
   - **Energy Boost / Modulating Step** ($\Delta_{\text{num}} = 2, \text{mode}_1 = \text{mode}_2$): Weight = $5.0$
   - **Clashing Key** ($\Delta_{\text{num}} > 2$): Penalized
3. **BPM Energy Curves**:
   - **Wave**: Sinusoidal energy build-ups and cool-down resets.
   - **Ascending / Build-Up**: Steady tempo progression from opening warm-up to peak-time.
   - **Descending**: Smooth wind-down set progression.

---

## 3. Universal DJ Playlist Exporter

Located in `src/shared/playlistExporter.ts`.

| Format | File Extension | DJ Ecosystem Support |
| :--- | :--- | :--- |
| **Extended M3U8** | `.m3u8` | **Pioneer Rekordbox, Serato DJ Pro, Traktor Pro, Engine DJ, VirtualDJ, Apple Music** |
| **Standard M3U** | `.m3u` | Generic media players (VLC, Winamp, Foobar2000) |
| **Pioneer Rekordbox XML** | `.xml` | Full Pioneer collection bridge with `<TONALITY>` key and `<AVERAGEBPM>` metadata |
| **DJ Tracklist** | `.txt` / `.csv` | 1001Tracklists, Mixcloud, SoundCloud, or spreadsheet cataloging |
| **JSON** | `.json` | Raw structured machine-readable export |

---

## 4. Metadata Persistence & Disk Safety

### A. Container-aware tag writing

| Container | Writer | Fields |
| :--- | :--- | :--- |
| MP3, WAV, AIFF | `node-id3` | `TBPM` (BPM), `TKEY` (Camelot key), plus standard frames |
| FLAC | Project's own Vorbis writer (`services/tagging/flac.ts`) | `BPM`, `INITIALKEY`, plus `TITLE`/`ARTIST`/`ALBUM` and a `PICTURE` block |
| Others (`.m4a`, `.opus`, ...) | None | The write is refused and reported, rather than silently reported as succeeding |

FLAC deliberately does **not** go through `node-id3`. That library writes an ID3v2 container, which in a FLAC file means a blob prepended before the `fLaC` magic - out of spec, rejected by strict decoders and some CDJ firmware, and invisible to Rekordbox and Serato, which read BPM and key from Vorbis comments only. The writer also strips any leading ID3v2 blob it finds, repairing files damaged by earlier versions.

### B. Two-phase verified tag writes

Tagging mutates files a user often cannot re-acquire. No write ever touches the original in place. `services/tagging/safeWrite.ts` runs four steps:

1. **Copy** the original to a sibling work file - same directory, therefore same volume, so the final rename is atomic rather than a cross-device copy.
2. **Mutate** the work file.
3. **Verify** it independently: re-parse it, confirm the container is unchanged, confirm the audio duration is within tolerance, and read the intended tags back out. A candidate that cannot be parsed fails verification rather than passing it.
4. **Swap** it over the original, with the original moved aside to a backup until the swap has succeeded, and rolled back if it has not.

Any failure at any step leaves the original byte-identical.

### C. Analysis is never written speculatively

`detectBpmFromPcm` and `detectKeyFromPcm` return `null` when the signal cannot support an estimate. Tags are written only above `MIN_TAG_WRITE_CONFIDENCE`; below it the result is shown in the UI and marked low-confidence, but nothing is written to disk. BPM confidence is measured as **peak prominence** (best autocorrelation over the mean of the others), which is scale-invariant - the earlier formula scaled with track loudness and so reported high confidence for anything loud.

### D. Database writes

Store persistence (`db.json`) writes to a temp file and renames over the target - atomic on POSIX, and retried on Windows where an antivirus or indexer can transiently hold the file. The file is never unlinked first, which previously left a window in which the database did not exist at all.

---

## 5. Security Model

The threat model is not "public internet server". It is a local HTTP server, bound to loopback, holding **full filesystem authority**, on a fixed and guessable port, reachable by any page loaded in any browser on the machine. Three controls follow.

### A. Path containment (`src/server/util/paths.ts`)

Every caller-supplied filesystem path must resolve inside an allowed root before it is touched. Without this, `GET /api/mp3/stream?path=...` is an arbitrary file read reachable from a plain `<audio src>` with no CORS preflight, and `POST /api/mp3/delete` is an arbitrary unlink.

- Roots are the configured library and download directories, plus directories the user explicitly picked in the native dialog or explicitly scanned this session. Session grants are held in memory and die with the process; they are never persisted to `db.json`.
- Containment is tested with `path.relative`, not a string prefix, so `C:\library-evil` is not mistaken for a child of `C:\library`.
- When the target exists, the symlink-resolved path is re-checked, so a link planted inside the library cannot be used to escape it.
- The guard is applied at the route **and** re-asserted in the service layer for the operations that move or delete files, because containment is an invariant of those operations rather than a property of one caller.

### B. Loopback guard (`src/server/middleware/localGuard.ts`)

- **`Host` allow-list** - defeats DNS rebinding, which cannot forge the Host header.
- **`Origin` allow-list** - defeats cross-origin requests. This is what actually protects the simple `GET` routes; CORS preflight never applies to them.
- **Per-launch session token** - a random value injected into the served HTML by the Electron main process and required on every mutating request. Never persisted, regenerated each launch. Off under the Vite dev server, which serves its own HTML and cannot inject it.

### C. Input validation (`src/shared/schemas.ts`)

Every request body and query is parsed with a zod schema at the route boundary. A TypeScript cast over `await c.req.json()` is a compile-time assertion about runtime-untrusted data and proves nothing.

### D. Credentials

Stored unencrypted in `data/db.json` - a deliberate trade, since an OS keychain cannot travel on a USB stick, and the drive should be treated as a credential in its own right. They are, however, never returned over the API: `GET /api/accounts` yields presence flags and hints only (`util/redact.ts`), and connection tests reference an account by id so the secret never leaves the process.

### E. Desktop shell

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a CSP permitting only same-origin resources plus remote cover art, external links forced out to the system browser, and in-window navigation restricted to the local app. The folder picker uses the Electron native dialog rather than shelling out; where the browser-mode fallback must shell out, it uses `execFile` with an argument array so no shell parses caller-supplied text.

---

## 6. Design Decisions & Rationale

Decisions recorded with the trade accepted, so a future change knows what it is overturning.

| # | Decision | Rationale | Trade accepted |
| :-- | :--- | :--- | :--- |
| 1 | **Zero native dependencies** - no SQLite, no ffmpeg, no essentia/aubio | The portable single-file `.exe` / `.AppImage` running off a USB stick is the product. Native bindings break that outright | Slower DSP and a JSON store instead of a database |
| 2 | **Hand-rolled Radix-2 FFT** rather than a library | Correct, dependency-free, and fast enough at $N = 2048$ | Maintaining ~60 lines of transform code |
| 3 | **DSP on the server, in a worker pool** - not WebAudio in the browser | The server has direct file access, needs no upload, and can write tags. The original problem was threading, not location | A worker script must be emitted as a second build entry; dev falls back to in-process |
| 4 | **JSON store, not SQLite** | See 1. Human-readable, trivially portable, no migration story needed at this size | Full-file rewrite per mutation; mitigated with `store.batch()` |
| 5 | **Own FLAC Vorbis writer** rather than `node-id3` on FLAC | `node-id3` prepends an ID3v2 blob, which is invalid in FLAC and invisible to Rekordbox and Serato - the software this tool exists to feed | ~250 lines of container code, covered by unit tests |
| 6 | **Two-phase verified tag writes** for every container | Tagging mutates paid lossless files the user often cannot re-acquire. A library that half-writes one destroys the only copy | One extra file copy per write |
| 7 | **`null` on failed detection**, never a plausible default | A wrong key is indistinguishable from a real one once on disk and silently ruins harmonic mixing. Worse than no value | Callers must handle `null` |
| 8 | **Session-granted path roots** rather than a fixed allow-list | A fixed list would break the legitimate workflow of scanning an arbitrary folder | Grants are per-process, so a restart re-requires the pick |
| 9 | **Hash routing** rather than history routing | Behaves identically under the dev server, the embedded server, and `file://`, so it does not compromise portability | `#/` in the URL |
| 10 | **React context + custom hooks**, no state library | Four views and one complex page do not justify Redux/Zustand | Manual memoisation discipline |
| 11 | **SSE, not WebSockets** | Progress is one-way. SSE reconnects on its own and needs no protocol upgrade | No client-to-server channel on that transport |
| 12 | **Adapter + registry for streaming services** | Adding Tidal is a folder plus one registry line | A thin indirection for the two services that exist today |
| 13 | **Self-hosted fonts** | The app is built to run offline off a USB stick at a venue; a CDN fetch is a silent degradation there, and an outbound request per launch from a "zero cloud" tool | 752 KB in the bundle |
| 14 | **Unencrypted credentials, loudly documented** | OS keychains do not travel on portable media; pretending otherwise is worse than stating the trade | The drive is a credential; encryption remains open as Phase 9 |
