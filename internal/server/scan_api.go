package server

import (
	"net/http"
	"os"

	"github.com/Pusher91/webtruder/internal/domain"
	"github.com/Pusher91/webtruder/internal/server/api"
)

func (s *Server) scanFindingsAPI(r *http.Request) (any, *api.APIError) {
	scanID, page, apiErr := readPaged(r, 200, 2000, s.scanRepo.FindingsPage, "failed to read findings")
	if apiErr != nil {
		return nil, apiErr
	}

	// Best-effort: include scan-wide totals from meta.
	var meta domain.Meta
	_ = s.scanRepo.ReadMeta(scanID, &meta)

	// Best-effort: hasMore by comparing cursor to file size.
	hasMore := false
	if st, err := os.Stat(s.scanRepo.FindingsPath(scanID)); err == nil {
		hasMore = page.NextCursor < st.Size()
	}

	return map[string]any{
		"items":         page.Items,
		"nextCursor":    page.NextCursor,
		"hasMore":       hasMore,
		"totalFindings": meta.TotalFindings,
	}, nil
}
