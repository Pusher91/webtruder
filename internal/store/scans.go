package store

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type ScanStore struct {
	dir string
}

func NewScanStore(dir string) (*ScanStore, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &ScanStore{dir: dir}, nil
}

func (s *ScanStore) Dir() string { return s.dir }

func (s *ScanStore) MetaPath(id string) string {
	return filepath.Join(s.dir, id+".json")
}

func (s *ScanStore) WriteMeta(id string, v any) error {
	return writeJSONAtomic(s.MetaPath(id), v)
}

func (s *ScanStore) ReadMeta(id string, dst any) error {
	b, err := os.ReadFile(s.MetaPath(id))
	if err != nil {
		return err
	}
	return json.Unmarshal(b, dst)
}
