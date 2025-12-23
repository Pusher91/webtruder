package server

import (
	"errors"
	"net/http"
	"os"
	"strings"

	"github.com/Pusher91/webtruder/internal/domain"
	"github.com/Pusher91/webtruder/internal/ndjson"
	"github.com/Pusher91/webtruder/internal/server/api"
)

type deleteScanResp struct {
	Deleted      bool `json:"deleted"`
	RemovedFiles int  `json:"removedFiles"`
}

func (s *Server) deleteScanAPI(r *http.Request) (any, *api.APIError) {
	id, apiErr := api.ReadScanIDBodyJSON(r)
	if apiErr != nil {
		return nil, apiErr
	}

	if s.engine.IsActive(id) {
		return nil, &api.APIError{
			Status: http.StatusConflict,
			Err:    api.Error{Code: "conflict", Message: "scan is running"},
		}
	}

	var meta domain.Meta
	if err := s.scanRepo.ReadMeta(id, &meta); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, &api.APIError{Status: http.StatusNotFound, Err: api.Error{Code: "not_found", Message: "scan not found"}}
		}
		return nil, &api.APIError{Status: http.StatusInternalServerError, Err: api.Error{Code: "internal_error", Message: "failed to read scan meta"}}
	}

	paths := []string{
		s.scanRepo.MetaPath(id),
		s.scanRepo.MetaPath(id) + ".tmp",
		ndjson.FindingsPath(s.dataDir, id),
		ndjson.ErrorsPath(s.dataDir, id),
		ndjson.LogPath(s.dataDir, id),
	}

	if meta.LogFile != "" {
		defaultLog := ndjson.LogPath(s.dataDir, id)
		if meta.LogFile != defaultLog && s.scanRepo != nil {
			if p, ok := s.scanRepo.SafeScanFile(meta.LogFile); ok && p != "" {
				paths = append(paths, p)
			}
		}
	}

	seen := map[string]struct{}{}
	removed := 0

	for _, p := range paths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}

		ok, err := removeIfExists(p)
		if err != nil {
			return nil, &api.APIError{
				Status: http.StatusInternalServerError,
				Err:    api.Error{Code: "internal_error", Message: "failed to delete scan files"},
			}
		}
		if ok {
			removed++
		}
	}

	return deleteScanResp{Deleted: removed > 0, RemovedFiles: removed}, nil
}

func removeIfExists(path string) (bool, error) {
	err := os.Remove(path)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, err
}
