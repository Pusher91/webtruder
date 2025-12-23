package api

import (
	"encoding/json"
	"net/http"
)

type APIError struct {
	Status int
	Err    Error
}

type Handler func(r *http.Request) (any, *APIError)

func Wrap(h Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		data, apiErr := h(r)
		if apiErr != nil {
			w.WriteHeader(apiErr.Status)
			_ = json.NewEncoder(w).Encode(Response{OK: false, Error: &apiErr.Err})
			return
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(Response{OK: true, Data: data})
	}
}

func WrapMethod(method string, h Handler) http.HandlerFunc {
	return Wrap(func(r *http.Request) (any, *APIError) {
		if r.Method != method {
			return nil, &APIError{
				Status: http.StatusMethodNotAllowed,
				Err:    Error{Code: "method_not_allowed", Message: "method not allowed"},
			}
		}
		return h(r)
	})
}
