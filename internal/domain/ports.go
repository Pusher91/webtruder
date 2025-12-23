package domain

import "context"

type WordlistStore interface {
	WordlistLines(ctx context.Context, wordlistID string) ([]string, error)
	WordlistMeta(ctx context.Context, wordlistID string) (*WordlistMeta, error)
}

type ScanRecorder interface {
	WriteFinding(f Finding) error
	WriteProbe(p Probe) error
	ProbePath() string
	Close() error
}

type ScanRepo interface {
	WriteMeta(ctx context.Context, scanID string, meta Meta) error
	OpenRecorder(ctx context.Context, scanID string, verbose bool) (ScanRecorder, error)
}

type Emitter interface {
	Emit(event string, payload any)
}
