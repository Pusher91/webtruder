package store

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/Pusher91/webtruder/internal/domain"
	"github.com/Pusher91/webtruder/internal/ndjson"
)

type ScanRepo struct {
	dataDir string
	scans   *ScanStore
}

func NewScanRepo(dataDir string, scans *ScanStore) *ScanRepo {
	return &ScanRepo{dataDir: dataDir, scans: scans}
}

func (r *ScanRepo) Dir() string { return r.scans.Dir() }

func (r *ScanRepo) MetaPath(scanID string) string { return r.scans.MetaPath(scanID) }

func (r *ScanRepo) ReadMeta(scanID string, dst any) error { return r.scans.ReadMeta(scanID, dst) }

func (r *ScanRepo) WriteMetaJSON(scanID string, v any) error { return r.scans.WriteMeta(scanID, v) }

func (r *ScanRepo) FindingsPath(scanID string) string { return ndjson.FindingsPath(r.dataDir, scanID) }

func (r *ScanRepo) defaultProbePath(scanID string) string { return ndjson.LogPath(r.dataDir, scanID) }

func (r *ScanRepo) legacyErrorsPath(scanID string) string {
	return ndjson.ErrorsPath(r.dataDir, scanID)
}

func (r *ScanRepo) SafeScanFile(p string) (string, bool) {
	c := filepath.Clean(p)
	base := filepath.Clean(filepath.Join(r.dataDir, "scans"))
	if c == base {
		return "", false
	}
	if strings.HasPrefix(c, base+string(os.PathSeparator)) {
		return c, true
	}
	return "", false
}

func (r *ScanRepo) probePathForScan(scanID string) string {
	var meta domain.Meta
	if err := r.scans.ReadMeta(scanID, &meta); err == nil {
		if p, ok := r.SafeScanFile(strings.TrimSpace(meta.LogFile)); ok && p != "" {
			return p
		}
	}
	return r.defaultProbePath(scanID)
}

func (r *ScanRepo) WriteMeta(ctx context.Context, scanID string, meta domain.Meta) error {
	_ = ctx
	return r.scans.WriteMeta(scanID, meta)
}

type scanRecorder struct {
	repo      *ScanRepo
	scanID    string
	probePath string

	findings *ndjson.NDJSONWriter
	probes   *ndjson.NDJSONWriter
}

func (r *ScanRepo) OpenRecorder(ctx context.Context, scanID string, verbose bool) (domain.ScanRecorder, error) {
	_ = ctx
	_ = verbose // engine controls whether non-error probes are written

	rec := &scanRecorder{
		repo:      r,
		scanID:    scanID,
		probePath: r.defaultProbePath(scanID),
	}

	wFindings, err := ndjson.NewNDJSONWriter(r.FindingsPath(scanID))
	if err != nil {
		return nil, err
	}

	wProbes, err := ndjson.NewNDJSONWriter(rec.probePath)
	if err != nil {
		_ = wFindings.Close()
		return nil, err
	}

	rec.findings = wFindings
	rec.probes = wProbes
	return rec, nil
}

func (w *scanRecorder) WriteFinding(f domain.Finding) error { return w.findings.Write(f) }

func (w *scanRecorder) WriteProbe(p domain.Probe) error { return w.probes.Write(p) }

func (w *scanRecorder) ProbePath() string { return w.probePath }

func (w *scanRecorder) Close() error {
	if w == nil {
		return nil
	}
	var first error
	if w.findings != nil {
		if err := w.findings.Close(); err != nil && first == nil {
			first = err
		}
	}
	if w.probes != nil {
		if err := w.probes.Close(); err != nil && first == nil {
			first = err
		}
	}
	return first
}

func (r *ScanRepo) FindingsPage(scanID string, cursor int64, limit int) (ndjson.NDJSONPage[domain.Finding], error) {
	return ndjson.ReadNDJSONFromOffset[domain.Finding](r.FindingsPath(scanID), cursor, limit)
}

func (r *ScanRepo) ErrorsPage(scanID string, cursor int64, limit int) (ndjson.NDJSONPage[domain.Probe], error) {
	if _, err := os.Stat(r.legacyErrorsPath(scanID)); err == nil {
		return ndjson.ReadNDJSONFromOffset[domain.Probe](r.legacyErrorsPath(scanID), cursor, limit)
	}
	return ndjson.ReadNDJSONFromOffsetFiltered[domain.Probe](
		r.probePathForScan(scanID),
		cursor,
		limit,
		func(p domain.Probe) bool { return strings.TrimSpace(p.Error) != "" },
	)
}

func (r *ScanRepo) LogPage(scanID string, cursor int64, limit int) (ndjson.NDJSONPage[domain.Probe], error) {
	return ndjson.ReadNDJSONFromOffset[domain.Probe](r.probePathForScan(scanID), cursor, limit)
}
