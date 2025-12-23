package server

import (
	"net/http"

	"github.com/Pusher91/webtruder/internal/domain"
	"github.com/Pusher91/webtruder/internal/server/api"
)

func (s *Server) scanProbeLogAPI(r *http.Request, defaultLimit int, fn pageFn[domain.Probe], internalErrMsg string) (any, *api.APIError) {
	_, page, apiErr := readPaged(r, defaultLimit, 2000, fn, internalErrMsg)
	if apiErr != nil {
		return nil, apiErr
	}
	return page, nil
}
