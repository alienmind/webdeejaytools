# WebDeeJayTools 🎧

A local web application and automation suite for DJs.

## Features

- 🔄 **Tool 1: Playlist Converter / Importer / Exporter**
  - Cross-service track & playlist synchronization between Spotify and Qobuz.
  - Multi-account management for both services.
  - Intelligent track matching engine using ISRC codes, normalized title/artist string distance, and duration heuristics.
  - Detailed match breakdown (hits, misses, confidence scores).

- ⬇️ **Tool 2: Track & Playlist Downloader**
  - Download individual tracks, full albums, or playlists to local storage.
  - High-quality MP3 (320kbps) and Lossless FLAC (16-bit / 24-bit Hi-Res) from Qobuz.
  - Automatic ID3v2 & FLAC metadata tagging and high-res cover art embedding.
  - Directory sanitization with customizable folder/file templates.
  - Automatic `.m3u` playlist generation.

- ⚙️ **Tool 3: Admin & Settings Panel**
  - Multi-account credential manager for Qobuz and Spotify.
  - Automated Qobuz app id and bundle secret discovery.
  - Default download directories and audio quality preferences.

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+

### Installation & Run
```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.
