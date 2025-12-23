package server

import (
	"net/http"

	"github.com/Pusher91/webtruder/internal/ndjson"
	"github.com/Pusher91/webtruder/internal/server/api"
)

type pageFn[T any] func(scanID string, cursor int64, limit int) (ndjson.NDJSONPage[T], error)

func readPaged[T any](
	r *http.Request,
	defaultLimit, maxLimit int,
	fn pageFn[T],
	internalErrMsg string,
) (string, ndjson.NDJSONPage[T], *api.APIError) {
	q := r.URL.Query()

	scanID, apiErr := api.RequireScanID(q.Get("scanId"))
	if apiErr != nil {
		return "", ndjson.NDJSONPage[T]{}, apiErr
	}

	cursor, limit, apiErr := api.CursorLimitFromQuery(q, defaultLimit, maxLimit)
	if apiErr != nil {
		return "", ndjson.NDJSONPage[T]{}, apiErr
	}

	page, err := fn(scanID, cursor, limit)
	if err != nil {
		return "", ndjson.NDJSONPage[T]{}, &api.APIError{
			Status: http.StatusInternalServerError,
			Err:    api.Error{Code: "internal_error", Message: internalErrMsg},
		}
	}

	return scanID, page, nil
}
