# webtruder

Lightweight, localhost-only web UI for bulk web directory enumeration during penetration tests. Single Go binary, minimal dependencies, no authentication, results + progress streamed live.



## What it does
- Enumerates paths from a wordlist across many HTTP(S) targets
- Live progress + findings in the browser (SSE)
- Stores scan state and output locally under a data directory
- Reduces noise with per-host soft-404 baselining

## Usage
./webtruder -addr 127.0.0.1:8787 -data-dir webtruder_data

Open: http://127.0.0.1:8787

## Flags
- -addr (default: 127.0.0.1:8787)
  Listen address (binds to localhost by default)
- -data-dir (default: webtruder_data)
  Directory for scans + wordlists
- -enable-ipify (default: false)
  Enable public IPv4 lookup via ipify for display in the web UI

## Notes
- Localhost-focused and unauthenticated by design; do not expose directly to the internet.
- Designed to be stable and easy to run across many Linux distros.

