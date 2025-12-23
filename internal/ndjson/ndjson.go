package ndjson

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
)

func FindingsPath(dataDir, scanId string) string {
	return filepath.Join(dataDir, "scans", scanId+".findings.ndjson")
}

// LogPath is now the canonical "probes" stream path (errors + optional verbose probes).
func LogPath(dataDir, scanId string) string {
	return filepath.Join(dataDir, "scans", scanId+".probes.ndjson")
}

// ErrorsPath is legacy-only for older scans that wrote a dedicated errors file.
func ErrorsPath(dataDir, scanId string) string {
	return filepath.Join(dataDir, "scans", scanId+".errors.ndjson")
}

type NDJSONPage[T any] struct {
	Items      []T   `json:"items"`
	NextCursor int64 `json:"nextCursor"`
}

func ReadNDJSONFromOffset[T any](path string, cursor int64, limit int) (NDJSONPage[T], error) {
	return ReadNDJSONFromOffsetFiltered[T](path, cursor, limit, nil)
}

// keep == nil means "keep all".
func ReadNDJSONFromOffsetFiltered[T any](path string, cursor int64, limit int, keep func(T) bool) (NDJSONPage[T], error) {
	if limit <= 0 {
		limit = 200
	}
	if limit > 2000 {
		limit = 2000
	}
	if cursor < 0 {
		cursor = 0
	}

	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return NDJSONPage[T]{Items: []T{}, NextCursor: cursor}, nil
		}
		return NDJSONPage[T]{}, err
	}
	defer f.Close()

	st, err := f.Stat()
	if err != nil {
		return NDJSONPage[T]{}, err
	}
	if cursor > st.Size() {
		cursor = st.Size()
	}

	// Detect whether cursor is already at a line boundary.
	atLineStart := cursor == 0
	if cursor > 0 {
		if _, err := f.Seek(cursor-1, io.SeekStart); err != nil {
			return NDJSONPage[T]{}, err
		}
		var prev [1]byte
		if _, err := f.Read(prev[:]); err != nil {
			return NDJSONPage[T]{}, err
		}
		if prev[0] == '\n' {
			atLineStart = true
		}
	}

	if _, err := f.Seek(cursor, io.SeekStart); err != nil {
		return NDJSONPage[T]{}, err
	}

	r := bufio.NewReader(f)
	var items []T
	cur := cursor

	// If cursor is mid-line, discard remainder of that partial line.
	if !atLineStart {
		junk, err := r.ReadBytes('\n')
		if len(junk) > 0 {
			cur += int64(len(junk))
		}
		if errors.Is(err, io.EOF) {
			return NDJSONPage[T]{Items: []T{}, NextCursor: cur}, nil
		}
		if err != nil {
			return NDJSONPage[T]{}, err
		}
	}

	for len(items) < limit {
		line, err := r.ReadBytes('\n')
		if len(line) > 0 {
			cur += int64(len(line))
			var t T
			if jerr := json.Unmarshal(line, &t); jerr == nil {
				if keep == nil || keep(t) {
					items = append(items, t)
				}
			}
		}
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil && !errors.Is(err, io.EOF) {
			return NDJSONPage[T]{}, err
		}
	}

	return NDJSONPage[T]{Items: items, NextCursor: cur}, nil
}
