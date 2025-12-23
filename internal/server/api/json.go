// internal/server/api/json.go
package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

func ReadJSON(r *http.Request, dst any) *APIError {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	if err := dec.Decode(dst); err != nil {
		// http.MaxBytesReader error text starts with "http: request body too large"
		if strings.HasPrefix(err.Error(), "http: request body too large") {
			return &APIError{
				Status: http.StatusRequestEntityTooLarge,
				Err: Error{
					Code:    "payload_too_large",
					Message: "request body too large",
				},
			}
		}

		return &APIError{
			Status: http.StatusBadRequest,
			Err: Error{
				Code:    "bad_json",
				Message: "bad json",
			},
		}
	}

	if err := dec.Decode(&struct{}{}); err != io.EOF {
		return &APIError{
			Status: http.StatusBadRequest,
			Err: Error{
				Code:    "bad_json",
				Message: "bad json",
			},
		}
	}

	return nil
}
