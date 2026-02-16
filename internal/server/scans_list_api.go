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
	ProgressPct   int      `json:"progressPct"`
	TargetsDone   int      `json:"targetsDone"`
	TargetsTotal  int      `json:"targetsTotal"`
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

		progressPct, targetsDone, targetsTotal := computeScanProgress(meta)

		items = append(items, scansListItem{
			ID:            meta.ID,
			StartedAt:     meta.StartedAt,
			FinishedAt:    meta.FinishedAt,
			Status:        string(meta.Status),
			ProgressPct:   progressPct,
			TargetsDone:   targetsDone,
			TargetsTotal:  targetsTotal,
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

func computeScanProgress(meta domain.Meta) (progressPct, targetsDone, targetsTotal int) {
	targetsTotal = len(meta.Targets)
	if targetsTotal == 0 && len(meta.Hosts) > 0 {
		targetsTotal = len(meta.Hosts)
	}

	var checkedTotal int64
	var requestTotal int64

	for _, h := range meta.Hosts {
		total := h.Total
		checked := h.Checked
		if total > 0 {
			if checked < 0 {
				checked = 0
			}
			if checked > total {
				checked = total
			}
			checkedTotal += checked
			requestTotal += total

			if checked >= total {
				targetsDone++
			}
			continue
		}

		if strings.EqualFold(string(h.Status), string(domain.HostStatusCompleted)) {
			targetsDone++
		}
	}

	if requestTotal > 0 {
		progressPct = int((checkedTotal * 100) / requestTotal)
	} else if targetsTotal > 0 {
		progressPct = int((int64(targetsDone) * 100) / int64(targetsTotal))
	}

	status := strings.ToLower(strings.TrimSpace(string(meta.Status)))
	if status == string(domain.ScanStatusCompleted) {
		progressPct = 100
		if targetsTotal > 0 {
			targetsDone = targetsTotal
		}
	}

	if targetsTotal > 0 && targetsDone > targetsTotal {
		targetsDone = targetsTotal
	}
	if progressPct < 0 {
		progressPct = 0
	}
	if progressPct > 100 {
		progressPct = 100
	}

	return progressPct, targetsDone, targetsTotal
}
