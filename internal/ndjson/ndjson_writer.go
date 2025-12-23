package ndjson

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type NDJSONWriter struct {
	mu sync.Mutex
	f  *os.File
}

func NewNDJSONWriter(path string) (*NDJSONWriter, error) {
	return NewNDJSONWriterWith(path, 0, 0)
}

// bufSize/flushEvery retained for compatibility; no buffering is used to keep each record atomic.
func NewNDJSONWriterWith(path string, bufSize int, flushEvery int) (*NDJSONWriter, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}

	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, err
	}

	return &NDJSONWriter{f: f}, nil
}

func (w *NDJSONWriter) Write(v any) error {
	if w == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	b = append(b, '\n')

	w.mu.Lock()
	defer w.mu.Unlock()

	if w.f == nil {
		return nil
	}
	_, err = w.f.Write(b)
	return err
}

func (w *NDJSONWriter) Close() error {
	if w == nil {
		return nil
	}
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.f != nil {
		err := w.f.Close()
		w.f = nil
		return err
	}
	return nil
}
