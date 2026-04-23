# Bitcast Architecture

## Overview

Bitcast is a Node.js CLI tool that streams video from BitTorrent (or HTTP URLs) and casts it to DLNA/UPnP media renderers (Smart TVs) on the local network.

## System Diagram

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  User CLI   │────▶│  Torrent Client  │────▶│  HTTP Streaming  │
│  (cast.js)  │     │  (WebTorrent)    │     │  Server          │
└──────┬──────┘     └──────────────────┘     └────────┬─────────┘
       │                                              │
       │  SSDP Discovery                    Stream URL│
       ▼                                              ▼
┌──────────────┐     UPnP Control          ┌─────────────────┐
│  DLNA Layer  │───────────────────────────▶│  Smart TV /     │
│  (dlna.js)   │◀──────────────────────────│  Media Renderer │
└──────────────┘     Status Events          └─────────────────┘
```

## Core Modules

### `cast.js` — CLI Entry Point

The main entry point. Orchestrates the full flow:

1. Parses the CLI argument (torrent ID or HTTP URL)
2. If torrent: starts the streaming server, waits for the stream URL
3. Discovers DLNA players on the network via `dlna.js`
4. Casts the stream URL to the first discovered player
5. Enters an interactive command loop (play, pause, stop, seek, volume)

Key behaviors:
- `castWithRetry()` retries casting up to 5 times with 5-second intervals
- `playerUrl()` rewrites the stream URL to use the local IP closest to the player's subnet, enabling multi-network support
- `readCommands()` provides an interactive REPL for controlling playback

### `dlna.js` — DLNA Discovery & Player Control

Discovers DLNA/UPnP MediaRenderer devices via SSDP and wraps them with a player API.

**Discovery:**
- Creates one SSDP client per network interface (`os.networkInterfaces()`)
- Searches for multiple UPnP device types (MediaRenderer v1/v2, AVTransport)
- Runs periodic re-discovery every 10 seconds to find devices that come online late
- Deduplicates devices by `name@host`

**Player API:**
Each discovered device is wrapped as an EventEmitter with methods:
- `play(url, opts, cb)` — load and play media via UPnP AVTransport
- `pause(cb)`, `resume(cb)`, `stop(cb)` — transport controls
- `seek(time, cb)` — seek to position
- `volume(level, cb)` — set volume (0-1 range, scaled to device max)
- `status(cb)` — get current position and volume

Uses `upnp-mediarenderer-client` for the actual UPnP SOAP calls. Connection is lazy (via `thunky`) and auto-reconnects on close.

### `lib/server.js` — Torrent Streaming Server

Adds a torrent via WebTorrent and serves the largest video file over HTTP.

- Binds to `0.0.0.0` so the server is reachable from any network interface
- If the file is `.mp4`, uses WebTorrent's built-in `createServer()`
- Otherwise, delegates to `createMp4TranscodeServer` for on-the-fly transcoding
- Exports `closestAddress(targetHost)` — given a target IP, returns the local interface IP that shares the longest subnet prefix (used by `cast.js` to build player-specific URLs)

### `lib/createMp4TranscodeServer.js` — Transcode Server

For non-MP4 torrents, transcodes the video stream to H.264/MP4 using `stream-transcoder` (ffmpeg wrapper).

- Pipes the torrent file stream through ffmpeg → writes to `/tmp/bitcast/<infoHash>`
- Serves the transcoded file via Express at `/video`
- Supports HTTP Range requests for DLNA streaming (with DLNA-specific headers)
- `TranscodedStream` handles the case where the transcode is still in progress: reads what's been written so far and waits for `progress` events before sending more

### `lib/TranscodedStream.js` — Progressive Read Stream

A `Readable` stream that reads from a file that's still being written to (the transcode output). Coordinates with the transcoder via an EventEmitter:

- On `_read()`, reads the available byte range from the file
- If the requested range extends beyond what's written, waits for the next `progress` event
- On `finish`, marks the transcode as complete and stops waiting

### `lib/onExit.js` — Cleanup Handler

Registers cleanup callbacks for process exit, SIGINT, and uncaught exceptions.

### `server.js` — Standalone Server Entry

A simpler entry point that just starts the torrent streaming server without DLNA discovery. Useful for serving the stream to be consumed by other clients.

### `index.js` — Library Entry

Re-exports `dlna.js` for use as a Node.js module (`require('bitcast')()`).

## Data Flow

### Torrent → TV (happy path)

```
1. User runs: node cast.js <magnet-link>
2. cast.js calls server(magnet, callback)
3. lib/server.js adds torrent to WebTorrent
4. WebTorrent downloads metadata, identifies largest video file
5. If MP4 → torrent.createServer() on 0.0.0.0:<random-port>
   If not  → createMp4TranscodeServer (ffmpeg transcode → /tmp/bitcast/<hash>)
6. Server callback fires with stream URL (e.g. http://0.0.0.0:12345/0)
7. cast.js starts DLNA discovery (already running since module load)
8. SSDP M-SEARCH on each network interface
9. TV responds → ssdp 'response' → fetch device XML → create player
10. cast.js rewrites URL hostname to closest local interface IP
11. player.play(url) → UPnP SOAP Load → TV fetches stream → playback starts
12. Interactive command loop begins
```

### Multi-Network URL Rewriting

```
Machine has:
  eth0: 192.168.1.100
  wlan0: 10.0.0.50

TV is at: 192.168.1.200
Server bound to: 0.0.0.0:8080

Stream URL for this TV: http://192.168.1.100:8080/0
  (closestAddress picks 192.168.1.x because it shares 3 octets with 192.168.1.200)
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `webtorrent` | BitTorrent client (browser-compatible) |
| `node-ssdp` | SSDP discovery for UPnP devices |
| `upnp-mediarenderer-client` | UPnP/DLNA media renderer control |
| `stream-transcoder` | ffmpeg-based video transcoding |
| `express` | HTTP server for transcode streaming |
| `xml2js` | Parse UPnP device description XML |
| `simple-get` | HTTP GET for device descriptions |
| `mime` | MIME type detection for media files |
| `range-parser` | HTTP Range header parsing |
| `pump` | Stream piping with error handling |
| `eventemitter2` | Extended EventEmitter (wildcard support) |
| `readcommand` | Interactive CLI command loop |
| `thunky` | Lazy async initialization |
