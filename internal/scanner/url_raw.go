package scanner

import (
	"net/url"
	"strings"
)

func buildRawURL(base *url.URL, rawPath string) string {
	if base == nil {
		return ""
	}

	// Use EscapedPath so any encoding present in the target base path is preserved.
	basePath := base.EscapedPath()
	p := joinPath(basePath, rawPath)
	if p == "" {
		p = "/"
	}

	var sb strings.Builder
	sb.Grow(len(base.Scheme) + 3 + len(base.Host) + len(p) + 32)

	sb.WriteString(base.Scheme)
	sb.WriteString("://")
	if base.User != nil {
		sb.WriteString(base.User.String())
		sb.WriteByte('@')
	}
	sb.WriteString(base.Host)
	sb.WriteString(p)

	// If you *want* to preserve a query on the target URL for every probe, uncomment:
	// if base.RawQuery != "" { sb.WriteByte('?'); sb.WriteString(base.RawQuery) }

	return sb.String()
}
