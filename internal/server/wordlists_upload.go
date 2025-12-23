package server

import (
	"net/http"

	"github.com/Pusher91/webtruder/internal/server/api"
)

type uploadWordlistResp struct {
	WordlistID string `json:"wordlistId"`
	Bytes      int64  `json:"bytes"`
}

func (s *Server) uploadWordlistAPI(r *http.Request) (any, *api.APIError) {
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		return nil, &api.APIError{
			Status: http.StatusBadRequest,
			Err: api.Error{
				Code:    "bad_request",
				Message: "invalid multipart form",
			},
		}
	}

	f, hdr, err := r.FormFile("file")
	if err != nil {
		return nil, &api.APIError{
			Status: http.StatusBadRequest,
			Err: api.Error{
				Code:    "validation_error",
				Message: "invalid request",
				Details: map[string]string{"file": "required"},
			},
		}
	}
	defer f.Close()

	_ = hdr // available if you want to validate filename/extension/content-type

	id, n, err := s.wordlists.Put(hdr.Filename, f)
	if err != nil {
		return nil, &api.APIError{
			Status: http.StatusInternalServerError,
			Err: api.Error{
				Code:    "internal_error",
				Message: "upload failed",
			},
		}
	}

	return uploadWordlistResp{WordlistID: id, Bytes: n}, nil
}
