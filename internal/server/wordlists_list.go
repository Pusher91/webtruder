package server

import (
	"net/http"

	"github.com/Pusher91/webtruder/internal/server/api"
)

type wordlistItem struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Bytes      int64  `json:"bytes"`
	UploadedAt string `json:"uploadedAt"`
}

type listWordlistsResp struct {
	Items []wordlistItem `json:"items"`
}

type deleteWordlistResp struct {
	Deleted bool `json:"deleted"`
}

func (s *Server) wordlistsAPI(r *http.Request) (any, *api.APIError) {
	switch r.Method {

	case http.MethodGet:
		metas, err := s.wordlists.List()
		if err != nil {
			return nil, &api.APIError{
				Status: http.StatusInternalServerError,
				Err:    api.Error{Code: "internal_error", Message: "failed to list wordlists"},
			}
		}

		items := make([]wordlistItem, 0, len(metas))
		for _, m := range metas {
			name := m.ID[:12] + ".txt"
			if len(m.Names) > 0 && m.Names[0] != "" {
				name = m.Names[0]
			}
			items = append(items, wordlistItem{
				ID:         m.ID,
				Name:       name,
				Bytes:      m.Bytes,
				UploadedAt: m.UploadedAt,
			})
		}

		return listWordlistsResp{Items: items}, nil

	case http.MethodDelete:
		id, apiErr := api.RequireSHA256(r.URL.Query().Get("id"), "id")
		if apiErr != nil {
			return nil, apiErr
		}

		deleted, err := s.wordlists.Delete(id)
		if err != nil {
			return nil, &api.APIError{
				Status: http.StatusInternalServerError,
				Err:    api.Error{Code: "internal_error", Message: "failed to delete wordlist"},
			}
		}

		return deleteWordlistResp{Deleted: deleted}, nil

	default:
		return nil, &api.APIError{
			Status: http.StatusMethodNotAllowed,
			Err:    api.Error{Code: "method_not_allowed", Message: "method not allowed"},
		}
	}
}
