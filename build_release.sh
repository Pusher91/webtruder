#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Usage: ./build_release.sh [version]

Examples:
  ./build_release.sh
  ./build_release.sh v0.5.0
  ./build_release.sh 0.5.0
EOF
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

normalize_tag() {
  local raw="$1"
  raw="${raw//[[:space:]]/}"
  raw="${raw#v}"
  if [[ ! "$raw" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    return 1
  fi
  printf 'v%s' "$raw"
}

build_binaries() {
  local tag="$1"

  rm -rf dist
  mkdir -p dist

  npm ci
  npm run build

  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags "-s -w -X main.version=$tag" \
    -o dist/webtruder_linux_amd64 ./cmd/webtruder

  CGO_ENABLED=0 GOOS=linux GOARCH=arm64 \
    go build -trimpath -ldflags "-s -w -X main.version=$tag" \
    -o dist/webtruder_linux_arm64 ./cmd/webtruder

  CGO_ENABLED=0 GOOS=windows GOARCH=amd64 \
    go build -trimpath -ldflags "-s -w -X main.version=$tag" \
    -o dist/webtruder_windows_amd64.exe ./cmd/webtruder

  if command -v sha256sum >/dev/null 2>&1; then
    (cd dist && sha256sum webtruder_linux_amd64 webtruder_linux_arm64 webtruder_windows_amd64.exe > sha256sums.txt)
  elif command -v shasum >/dev/null 2>&1; then
    (cd dist && shasum -a 256 webtruder_linux_amd64 webtruder_linux_arm64 webtruder_windows_amd64.exe > sha256sums.txt)
  else
    echo "Missing required checksum tool: sha256sum or shasum" >&2
    exit 1
  fi
}

need_cmd git
need_cmd go
need_cmd npm
need_cmd gh

version_input="${1:-}"
if [[ -z "$version_input" ]]; then
  read -r -p "Next version (e.g. v0.5.0): " version_input
fi

if [[ "$version_input" == "-h" || "$version_input" == "--help" ]]; then
  usage
  exit 0
fi

if ! tag="$(normalize_tag "$version_input")"; then
  echo "Invalid version '$version_input'. Expected format: vX.Y.Z or X.Y.Z" >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1; then
  echo "Tag already exists: $tag" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

echo "Releasing $tag"

git add -A
if ! git diff --cached --quiet; then
  git commit -m "update"
else
  echo "No staged changes detected. Skipping commit."
fi

git push origin main
git tag -a "$tag" -m "$tag"

build_binaries "$tag"
git push origin "$tag"

if gh release view "$tag" >/dev/null 2>&1; then
  gh release upload "$tag" \
    dist/webtruder_linux_amd64 \
    dist/webtruder_linux_arm64 \
    dist/webtruder_windows_amd64.exe \
    dist/sha256sums.txt \
    --clobber
else
  gh release create "$tag" \
    dist/webtruder_linux_amd64 \
    dist/webtruder_linux_arm64 \
    dist/webtruder_windows_amd64.exe \
    dist/sha256sums.txt \
    --title "$tag" \
    --notes "update"
fi

echo "Release complete: $tag"
