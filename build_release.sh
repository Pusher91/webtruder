cd /mnt/c/Users/Dave/Desktop/webtruder
rm -rf dist
mkdir -p dist
npm ci
npm run build
VERSION="$(git describe --tags --always --dirty 2>/dev/null || echo dev)"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o dist/webtruder_linux_amd64 ./cmd/webtruder
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o dist/webtruder_linux_arm64 ./cmd/webtruder
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o dist/webtruder_windows_amd64.exe ./cmd/webtruder
(cd dist && sha256sum * > sha256sums.txt)

