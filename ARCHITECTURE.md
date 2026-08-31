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
│  - Zero-Native Audio DSP Engine (BPM Autocorrelation & Key Extractor)   │
│  - Tag Management (ID3 TBPM/TKEY & FLAC Vorbis metadata persistence)   │
│  - DJ Set Creator (Atomic cross-drive flattening & empty folder cleaner)│
│  - JSON Database Store (`./data/db.json` with Windows lock safety)      │
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

All heavy CPU-bound audio signal processing is executed on the **Node.js backend** to enable zero-copy direct file access, multi-core execution, and direct metadata tag writing without network overhead.

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

- **ID3 Tagging (`node-id3`)**: Detected BPM is written to `TBPM`; detected Camelot key is written to `TKEY`.
- **FLAC Vorbis Comments**: Persists `BPM` and `INITIALKEY` blocks.
- **Atomic Disk Writes**: Store persistence (`db.json`) employs atomic rename semantics with Windows file locking fallbacks (`fs.copyFileSync` + write).
