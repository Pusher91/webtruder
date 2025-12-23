package server

import (
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Pusher91/webtruder/internal/domain"
	"github.com/Pusher91/webtruder/internal/server/api"
)

func (s *Server) pauseScanAPI(r *http.Request) (any, *api.APIError) {
	id, apiErr := api.ReadScanIDBodyJSON(r)
	if apiErr != nil {
		return nil, apiErr
	}

	if s.engine.Pause(id) {
		s.emit("scan_paused", map[string]any{"scanId": id})
		return map[string]any{"paused": true}, nil
	}

	var meta domain.Meta
	if err := s.scanRepo.ReadMeta(id, &meta); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, &api.APIError{
				Status: http.StatusNotFound,
				Err:    api.Error{Code: "not_found", Message: "scan not found"},
			}
		}
		return nil, &api.APIError{
			Status: http.StatusInternalServerError,
			Err:    api.Error{Code: "internal_error", Message: "failed to read scan meta"},
		}
	}

	return nil, &api.APIError{
		Status: http.StatusConflict,
		Err:    api.Error{Code: "conflict", Message: "scan is not running"},
	}
}

func (s *Server) resumeScanAPI(r *http.Request) (any, *api.APIError) {
	id, apiErr := api.ReadScanIDBodyJSON(r)
	if apiErr != nil {
		return nil, apiErr
	}

	if s.engine.Resume(id) {
		s.emit("scan_resumed", map[string]any{"scanId": id})
		return map[string]any{"resumed": true}, nil
	}

	var meta domain.Meta
	if err := s.scanRepo.ReadMeta(id, &meta); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, &api.APIError{
				Status: http.StatusNotFound,
				Err:    api.Error{Code: "not_found", Message: "scan not found"},
			}
		}
		return nil, &api.APIError{
			Status: http.StatusInternalServerError,
			Err:    api.Error{Code: "internal_error", Message: "failed to read scan meta"},
		}
	}

	return nil, &api.APIError{
		Status: http.StatusConflict,
		Err:    api.Error{Code: "conflict", Message: "scan is not paused"},
	}
}

func (s *Server) stopScanAPI(r *http.Request) (any, *api.APIError) {
	id, apiErr := api.ReadScanIDBodyJSON(r)
	if apiErr != nil {
		return nil, apiErr
	}

	if s.engine.Stop(id) {
		s.emit("scan_stopped", map[string]any{"scanId": id})
		return map[string]any{"stopped": true}, nil
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

	now := time.Now().UTC().Format(time.RFC3339)

	st := strings.ToLower(strings.TrimSpace(string(meta.Status)))
	if st == string(domain.ScanStatusRunning) || st == string(domain.ScanStatusPaused) || st == "" {
		meta.Status = domain.ScanStatusStopped
		if strings.TrimSpace(meta.FinishedAt) == "" {
			meta.FinishedAt = now
		}

		if meta.Hosts != nil {
			for k, h := range meta.Hosts {
				hs := strings.ToLower(strings.TrimSpace(string(h.Status)))
				if hs != string(domain.HostStatusCompleted) && hs != string(domain.HostStatusError) {
					h.Status = domain.HostStatusStopped
					if strings.TrimSpace(h.FinishedAt) == "" {
						h.FinishedAt = now
					}
					meta.Hosts[k] = h
				}
			}
		}

		if err := s.scanRepo.WriteMeta(r.Context(), id, meta); err != nil {
			return nil, &api.APIError{Status: http.StatusInternalServerError, Err: api.Error{Code: "internal_error", Message: "failed to persist stopped state"}}
		}
	}

	s.emit("scan_stopped", map[string]any{"scanId": id, "orphaned": true})
	return map[string]any{"stopped": true, "orphaned": true}, nil
}
