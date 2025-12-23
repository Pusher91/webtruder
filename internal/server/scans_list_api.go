package server

import (
	"net/http"
	"os"
	"sort"
	"strings"

	"github.com/Pusher91/webtruder/internal/domain"
	"github.com/Pusher91/webtruder/internal/server/api"
)

type scansListItem struct {
	ID            string   `json:"id"`
	StartedAt     string   `json:"startedAt,omitempty"`
	FinishedAt    string   `json:"finishedAt,omitempty"`
	Status        string   `json:"status,omitempty"`
	Targets       []string `json:"targets,omitempty"`
	WordlistID    string   `json:"wordlistId,omitempty"`
	WordlistNames []string `json:"wordlistNames,omitempty"`
	TotalPaths    int      `json:"totalPaths,omitempty"`
	TotalRequests int64    `json:"totalRequests,omitempty"`
	TotalFindings int64    `json:"totalFindings,omitempty"`
	TotalErrors   int64    `json:"totalErrors,omitempty"`
	Tags          []string `json:"tags,omitempty"`
	Verbose       bool     `json:"verbose,omitempty"`
	LogFile       string   `json:"logFile,omitempty"`
	Proxy         string   `json:"proxy,omitempty"`
	Active        bool     `json:"active"`
}

type scansListResp struct {
	Items []scansListItem `json:"items"`
}

func (s *Server) scansListAPI(r *http.Request) (any, *api.APIError) {
	ents, err := os.ReadDir(s.scanRepo.Dir())
	if err != nil {
		return nil, &api.APIError{
			Status: http.StatusInternalServerError,
			Err:    api.Error{Code: "internal_error", Message: "failed to list scans"},
		}
	}

	items := make([]scansListItem, 0, len(ents))

	for _, e := range ents {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(name, ".json") {
			continue
		}

		id := strings.TrimSuffix(name, ".json")
		if !domain.IsValidScanID(id) {
			continue
		}

		var meta domain.Meta
		if err := s.scanRepo.ReadMeta(id, &meta); err != nil {
			continue
		}
		if meta.ID == "" {
			meta.ID = id
		}

		active := s.engine.IsActive(id)

		// If it's not active, a persisted running/paused/empty status is effectively stopped.
		if !active {
			st := strings.ToLower(strings.TrimSpace(string(meta.Status)))
			if st == string(domain.ScanStatusRunning) || st == string(domain.ScanStatusPaused) || st == "" {
				meta.Status = domain.ScanStatusStopped
			}
		}

		items = append(items, scansListItem{
			ID:            meta.ID,
			StartedAt:     meta.StartedAt,
			FinishedAt:    meta.FinishedAt,
			Status:        string(meta.Status),
			Targets:       meta.Targets,
			WordlistID:    meta.WordlistID,
			WordlistNames: meta.WordlistNames,
			TotalPaths:    meta.TotalPaths,
			TotalRequests: meta.TotalRequests,
			TotalFindings: meta.TotalFindings,
			TotalErrors:   meta.TotalErrors,
			Tags:          meta.Tags,
			Verbose:       meta.Verbose,
			LogFile:       meta.LogFile,
			Proxy:         meta.Proxy,
			Active:        active,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].StartedAt > items[j].StartedAt
	})

	return scansListResp{Items: items}, nil
}
