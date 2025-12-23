package server

import (
	"net/http"
	"os"

	"github.com/Pusher91/webtruder/internal/domain"
	"github.com/Pusher91/webtruder/internal/ndjson"
	"github.com/Pusher91/webtruder/internal/server/api"
)

func (s *Server) scanFindingsAPI(r *http.Request) (any, *api.APIError) {
	q := r.URL.Query()

	scanID, apiErr := api.RequireScanID(q.Get("scanId"))
	if apiErr != nil {
		return nil, apiErr
	}

	cursor, limit, apiErr := api.CursorLimitFromQuery(q, 200, 2000)
	if apiErr != nil {
		return nil, apiErr
	}

	keep, apiErr := buildFindingKeep(q)
	if apiErr != nil {
		return nil, apiErr
	}

	page, err := ndjson.ReadNDJSONFromOffsetFiltered[domain.Finding](
		s.scanRepo.FindingsPath(scanID),
		cursor,
		limit,
		keep,
	)
	if err != nil {
		return nil, &api.APIError{
			Status: http.StatusInternalServerError,
			Err:    api.Error{Code: "internal_error", Message: "failed to read findings"},
		}
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
