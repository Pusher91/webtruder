package store

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/Pusher91/webtruder/internal/domain"
)

type WordlistStore struct {
	dir string
}

func NewWordlistStore(dir string) (*WordlistStore, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &WordlistStore{dir: dir}, nil
}

func (s *WordlistStore) ContentPath(id string) string { return filepath.Join(s.dir, id+".txt") }
func (s *WordlistStore) MetaPath(id string) string    { return filepath.Join(s.dir, id+".json") }

func (s *WordlistStore) Meta(id string) (*domain.WordlistMeta, error) {
	b, err := os.ReadFile(s.MetaPath(id))
	if err != nil {
		return nil, err
	}
	var m domain.WordlistMeta
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	if m.ID == "" {
		return nil, errors.New("missing id in meta")
	}
	return &m, nil
}

func (s *WordlistStore) WordlistLines(ctx context.Context, wordlistID string) ([]string, error) {
	_ = ctx
	return s.ReadLines(wordlistID)
}

func (s *WordlistStore) WordlistMeta(ctx context.Context, wordlistID string) (*domain.WordlistMeta, error) {
	_ = ctx

	m, err := s.Meta(wordlistID)
	if err != nil {
		return nil, err
	}
	if m == nil || m.ID == "" {
		return nil, os.ErrNotExist
	}
	return m, nil
}

func (s *WordlistStore) Put(name string, r io.Reader) (id string, size int64, err error) {
	tmp, err := os.CreateTemp(s.dir, "upload-*.tmp")
	if err != nil {
		return "", 0, err
	}
	tmpPath := tmp.Name()
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
	}()

	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(tmp, h), r)
	if err != nil {
		return "", 0, err
	}

	sum := hex.EncodeToString(h.Sum(nil))
	finalContent := s.ContentPath(sum)

	if err := tmp.Close(); err != nil {
		return "", 0, err
	}

	if _, statErr := os.Stat(finalContent); statErr == nil {
		_ = s.upsertMeta(sum, name, n)
		return sum, n, nil
	} else if !errors.Is(statErr, os.ErrNotExist) {
		return "", 0, statErr
	}

	if err := os.Rename(tmpPath, finalContent); err != nil {
		return "", 0, err
	}

	_ = s.upsertMeta(sum, name, n)
	return sum, n, nil
}

func (s *WordlistStore) upsertMeta(id, name string, bytes int64) error {
	name = strings.TrimSpace(name)
	if name == "" {
		name = id[:12] + ".txt"
	}

	mp := s.MetaPath(id)

	var m domain.WordlistMeta
	if b, err := os.ReadFile(mp); err == nil {
		_ = json.Unmarshal(b, &m)
	}

	if m.ID == "" {
		m = domain.WordlistMeta{
			ID:         id,
			Names:      []string{name},
			Bytes:      bytes,
			UploadedAt: time.Now().UTC().Format(time.RFC3339),
		}
	} else {
		m.Bytes = bytes
		found := false
		for _, n := range m.Names {
			if n == name {
				found = true
				break
			}
		}
		if !found {
			m.Names = append([]string{name}, m.Names...)
			if len(m.Names) > 5 {
				m.Names = m.Names[:5]
			}
		}
	}

	return writeJSONAtomic(mp, m)
}

func (s *WordlistStore) List() ([]domain.WordlistMeta, error) {
	ents, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, err
	}
	out := make([]domain.WordlistMeta, 0, 64)
	for _, e := range ents {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(s.dir, e.Name()))
		if err != nil {
			continue
		}
		var m domain.WordlistMeta
		if err := json.Unmarshal(b, &m); err != nil || m.ID == "" {
			continue
		}
		out = append(out, m)
	}

	sort.Slice(out, func(i, j int) bool { return out[i].UploadedAt > out[j].UploadedAt })
	return out, nil
}

func (s *WordlistStore) Delete(id string) (deleted bool, err error) {
	cp := s.ContentPath(id)
	mp := s.MetaPath(id)

	removedAny := false

	if err := os.Remove(cp); err == nil {
		removedAny = true
	} else if !errors.Is(err, os.ErrNotExist) {
		return false, err
	}

	if err := os.Remove(mp); err == nil {
		removedAny = true
	} else if !errors.Is(err, os.ErrNotExist) {
		return false, err
	}

	return removedAny, nil
}

func (s *WordlistStore) ReadLines(id string) ([]string, error) {
	f, err := os.Open(s.ContentPath(id))
	if err != nil {
		return nil, err
	}
	defer f.Close()

	seen := make(map[string]struct{}, 4096)
	out := make([]string, 0, 1024)

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64*1024), 4*1024*1024)

	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, "/") {
			line = "/" + line
		}
		if _, ok := seen[line]; ok {
			continue
		}
		seen[line] = struct{}{}
		out = append(out, line)
	}
	return out, sc.Err()
}
