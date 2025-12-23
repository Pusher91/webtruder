package server

import (
	"net/http"

	"github.com/Pusher91/webtruder/internal/server/api"
)

func (s *Server) scanErrorsAPI(r *http.Request) (any, *api.APIError) {
	return s.scanProbeLogAPI(r, 500, s.scanRepo.ErrorsPage, "failed to read error log")
}
