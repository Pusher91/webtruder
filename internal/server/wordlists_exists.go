package server

import (
	"net/http"
	"os"

	"github.com/Pusher91/webtruder/internal/server/api"
)

type existsResp struct {
	Exists bool `json:"exists"`
}

func (s *Server) wordlistExistsAPI(r *http.Request) (any, *api.APIError) {
	id, apiErr := api.RequireSHA256(r.URL.Query().Get("id"), "id")
	if apiErr != nil {
		return nil, apiErr
	}

	_, err := os.Stat(s.wordlists.ContentPath(id))
	return existsResp{Exists: err == nil}, nil
}
