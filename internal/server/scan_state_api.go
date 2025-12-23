package server

import (
	"errors"
	"net/http"
	"os"
	"strings"

	"github.com/Pusher91/webtruder/internal/domain"
	"github.com/Pusher91/webtruder/internal/server/api"
)

type scanStateResp struct {
	Meta   domain.Meta `json:"meta"`
	Active bool        `json:"active"`
}

func (s *Server) scanStateAPI(r *http.Request) (any, *api.APIError) {
	id, apiErr := api.RequireScanID(r.URL.Query().Get("scanId"))
	if apiErr != nil {
		return nil, apiErr
	}

	var meta domain.Meta
	if err := s.scanRepo.ReadMeta(id, &meta); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, &api.APIError{Status: http.StatusNotFound, Err: api.Error{Code: "not_found", Message: "scan not found"}}
		}
		return nil, &api.APIError{Status: http.StatusInternalServerError, Err: api.Error{Code: "internal_error", Message: "failed to read scan meta"}}
	}
	if meta.ID == "" {
		meta.ID = id
	}

	active := s.engine.IsActive(id)

	// Normalize orphaned scans: if not active, "running/paused/empty" is effectively stopped.
	if !active {
		st := strings.ToLower(strings.TrimSpace(string(meta.Status)))
		if st == string(domain.ScanStatusRunning) || st == string(domain.ScanStatusPaused) || st == "" {
			meta.Status = domain.ScanStatusStopped
			if meta.Hosts != nil {
				for k, h := range meta.Hosts {
					hs := strings.ToLower(strings.TrimSpace(string(h.Status)))
					if hs != string(domain.HostStatusCompleted) && hs != string(domain.HostStatusError) {
						h.Status = domain.HostStatusStopped
						meta.Hosts[k] = h
					}
				}
			}
		}
	}

	return scanStateResp{Meta: meta, Active: active}, nil
}
