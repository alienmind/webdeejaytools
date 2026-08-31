# WebDeeJayTOOLS 🎧

A specialized, self-contained DJ automation suite and lossless audio manager. Runs both as a local web app and as a portable standalone desktop application (`.exe`, `.dmg`, `.AppImage`) that can be executed directly from a USB drive.

---

## Core Modules

- 🔄 **Playlist Converter**
  - Cross-service track & playlist synchronization between Spotify and Qobuz.
  - Multi-account management for both streaming services.
  - 4-Tier fuzzy matching engine using ISRC codes, normalized title/artist string distance (Levenshtein), and duration heuristics.
  - Detailed match breakdown (hits, misses, confidence scores, and success percentage).

- ⬇️ **Audio Downloader**
  - Download individual tracks, full albums, or playlists directly to local storage.
  - Lossless FLAC (16-bit / 24-bit Hi-Res up to 192kHz) and MP3 (320kbps).
  - Automatic ID3v2 & FLAC Vorbis metadata tagging with embedded high-resolution cover art.
  - Customizable directory/filename formatting templates (e.g. `{artist} - {album} ({year})/{trackNumber} - {title}`).
  - Automatic UTF-8 `.m3u` playlist generation.

- ⚙️ **Admin & Accounts Panel**
  - Multi-account credential manager for Qobuz and Spotify.
  - Direct `user_auth_token` input and one-way cURL / Cookie Quick Importer.
  - Interactive visual guide (`? How to get token?`) with DevTools screenshots.
  - Global download path and audio quality configuration.

---

## 🚀 Planned Features & Roadmap

- 📁 **Local MP3 Collection Management**
  - Deep scanning and indexing of existing local music libraries.
  - Identification of duplicate tracks, bitrate anomalies, and missing tags.
  - Batch metadata cleaning and tag editing directly on disk.

- 🎵 **Automatic BPM and Key Detection**
  - Native audio signal analysis to compute precise tempo (BPM).
  - Harmonic key detection (standard musical notation & Camelot / Open Key wheels).
  - Embedding BPM and Key tags into ID3/Vorbis headers for instant CDJ / DJ software recognition.

- 🪄 **Automatic Playlist Building based on Genres, Styles & Moods**
  - Smart playlist generation using acoustic descriptors, genre clustering, and mood profiles.
  - Harmonically mixed playlist sequencing (Camelot wheel energy transitions).
  - Direct export to M3U, Rekordbox XML, and streaming targets.

---

## Quickstart & Desktop Builds

### Portable Desktop App (No Node.js Required)
Grab the standalone portable binary for Windows, macOS, or Linux directly from the [GitHub Releases Page](https://github.com/alienmind/webdeejaytools/releases/latest).

### Run Locally (Development)
```bash
# 1. Install dependencies
pnpm install

# 2. Start development server
pnpm dev

# 3. Build standalone executables
pnpm run dist:win    # Windows Portable .exe & installer
pnpm run dist:mac    # macOS .dmg & zip
pnpm run dist:linux  # Linux .AppImage & tar.gz
```

Open [http://localhost:5173](http://localhost:5173) in your browser.
