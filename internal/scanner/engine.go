package scanner

import (
	"github.com/Pusher91/webtruder/internal/domain"
)

type Engine struct {
	wordlists domain.WordlistStore
	scans     domain.ScanRepo
	emitter   domain.Emitter
	mgr       *manager
}

func New(wordlists domain.WordlistStore, scans domain.ScanRepo, emitter domain.Emitter) *Engine {
	e := &Engine{wordlists: wordlists, scans: scans, emitter: emitter}
	e.mgr = newManager(e)
	return e
}

func (e *Engine) Start(req domain.StartRequest) string { return e.mgr.Start(req) }
func (e *Engine) Pause(id string) bool                 { return e.mgr.Pause(id) }
func (e *Engine) Resume(id string) bool                { return e.mgr.Resume(id) }
func (e *Engine) Stop(id string) bool                  { return e.mgr.Stop(id) }
func (e *Engine) IsActive(id string) bool              { return e.mgr.IsActive(id) }

func (e *Engine) emit(event string, payload any) {
	if e != nil && e.emitter != nil {
		e.emitter.Emit(event, payload)
	}
}
