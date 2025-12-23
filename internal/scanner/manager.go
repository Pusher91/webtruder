package scanner

import (
	"context"
	"sync"

	"github.com/Pusher91/webtruder/internal/domain"
)

type manager struct {
	engine *Engine

	mu   sync.Mutex
	runs map[string]*runtime
}

func newManager(e *Engine) *manager {
	return &manager{
		engine: e,
		runs:   make(map[string]*runtime),
	}
}

func (m *manager) Start(req domain.StartRequest) string {
	id := req.ScanID
	if id == "" {
		id = domain.NewScanID()
		req.ScanID = id
	}

	rt := &runtime{
		id:       id,
		statusCh: make(chan domain.ScanStatus, 1),
	}
	rt.ctx, rt.cancel = context.WithCancel(context.Background())

	m.mu.Lock()
	if _, exists := m.runs[id]; exists {
		m.mu.Unlock()
		return id
	}
	m.runs[id] = rt
	m.mu.Unlock()

	go func() {
		m.engine.runScan(rt, req)

		m.mu.Lock()
		delete(m.runs, id)
		m.mu.Unlock()
	}()

	return id
}

func (m *manager) IsActive(id string) bool {
	m.mu.Lock()
	_, ok := m.runs[id]
	m.mu.Unlock()
	return ok
}

func (m *manager) Pause(id string) bool {
	m.mu.Lock()
	rt := m.runs[id]
	m.mu.Unlock()
	if rt == nil {
		return false
	}

	rt.mu.Lock()
	if rt.paused {
		rt.mu.Unlock()
		rt.signalStatus(domain.ScanStatusPaused)
		return true
	}
	rt.paused = true
	if rt.resumeCh == nil {
		rt.resumeCh = make(chan struct{})
	}
	rt.mu.Unlock()

	rt.signalStatus(domain.ScanStatusPaused)
	return true
}

func (m *manager) Resume(id string) bool {
	m.mu.Lock()
	rt := m.runs[id]
	m.mu.Unlock()
	if rt == nil {
		return false
	}

	var ch chan struct{}

	rt.mu.Lock()
	if !rt.paused {
		rt.mu.Unlock()
		rt.signalStatus(domain.ScanStatusRunning)
		return true
	}
	rt.paused = false
	ch = rt.resumeCh
	rt.resumeCh = nil
	rt.mu.Unlock()

	if ch != nil {
		close(ch)
	}

	rt.signalStatus(domain.ScanStatusRunning)
	return true
}

func (m *manager) Stop(id string) bool {
	m.mu.Lock()
	rt := m.runs[id]
	m.mu.Unlock()
	if rt == nil {
		return false
	}

	// Unblock waiters if paused
	var ch chan struct{}
	rt.mu.Lock()
	ch = rt.resumeCh
	rt.paused = false
	rt.resumeCh = nil
	rt.mu.Unlock()
	if ch != nil {
		close(ch)
	}

	rt.signalStatus(domain.ScanStatusStopped)
	rt.cancel()

	return true
}

type runtime struct {
	id     string
	ctx    context.Context
	cancel context.CancelFunc

	mu       sync.Mutex
	paused   bool
	resumeCh chan struct{}

	desiredStatus domain.ScanStatus
	statusCh      chan domain.ScanStatus
}

func (rt *runtime) signalStatus(status domain.ScanStatus) {
	if rt == nil {
		return
	}
	rt.mu.Lock()
	rt.desiredStatus = status
	ch := rt.statusCh
	rt.mu.Unlock()

	if ch == nil {
		return
	}
	select {
	case ch <- status:
	default:
	}
}

func (rt *runtime) desiredStatusSnapshot() domain.ScanStatus {
	if rt == nil {
		return ""
	}
	rt.mu.Lock()
	st := rt.desiredStatus
	rt.mu.Unlock()
	return st
}

// waitIfPaused blocks while paused; returns false if the scan is stopping.
func (rt *runtime) waitIfPaused() bool {
	if rt == nil {
		return true
	}

	for {
		rt.mu.Lock()
		paused := rt.paused
		ch := rt.resumeCh
		ctx := rt.ctx
		rt.mu.Unlock()

		if !paused {
			return true
		}

		select {
		case <-ctx.Done():
			return false
		case <-ch:
			// resumed, loop to re-check state
		}
	}
}
