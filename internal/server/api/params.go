package api

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/Pusher91/webtruder/internal/domain"
)

func ValidationError(details map[string]string) *APIError {
	return &APIError{
		Status: http.StatusBadRequest,
		Err: Error{
			Code:    "validation_error",
			Message: "invalid request",
			Details: details,
		},
	}
}

func RequireScanID(raw string) (string, *APIError) {
	id := strings.TrimSpace(raw)
	if !domain.IsValidScanID(id) {
		return "", ValidationError(map[string]string{
			"scanId": "must be a 32-char lowercase hex id",
		})
	}
	return id, nil
}

func RequireSHA256(raw, field string) (string, *APIError) {
	id := strings.TrimSpace(raw)
	if !domain.IsValidWordlistID(id) {
		return "", ValidationError(map[string]string{
			field: "must be a 64-char lowercase hex sha256",
		})
	}
	return id, nil
}

type scanIDBody struct {
	ScanID string `json:"scanId"`
}

func ReadScanIDBodyJSON(r *http.Request) (string, *APIError) {
	var b scanIDBody
	if apiErr := ReadJSON(r, &b); apiErr != nil {
		return "", apiErr
	}
	return RequireScanID(b.ScanID)
}

func CursorLimitFromQuery(q url.Values, defaultLimit, maxLimit int) (int64, int, *APIError) {
	cursor := int64(0)
	if cStr := strings.TrimSpace(q.Get("cursor")); cStr != "" {
		v, err := strconv.ParseInt(cStr, 10, 64)
		if err != nil || v < 0 {
			return 0, 0, ValidationError(map[string]string{"cursor": "must be a non-negative integer"})
		}
		cursor = v
	}

	if defaultLimit <= 0 {
		defaultLimit = 200
	}
	if maxLimit <= 0 {
		maxLimit = 2000
	}
	limit := defaultLimit

	if lStr := strings.TrimSpace(q.Get("limit")); lStr != "" {
		v, err := strconv.Atoi(lStr)
		if err != nil || v <= 0 {
			return 0, 0, ValidationError(map[string]string{"limit": "must be a positive integer"})
		}
		limit = v
	}

	if limit > maxLimit {
		limit = maxLimit
	}
	return cursor, limit, nil
}
