package scanner

import (
	"time"

	"github.com/Pusher91/webtruder/internal/domain"
)

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func tokenBucket(interval time.Duration, burst int, stop <-chan struct{}) <-chan struct{} {
	if interval <= 0 {
		interval = time.Nanosecond
	}
	if burst <= 0 {
		burst = 1
	}

	ch := make(chan struct{}, burst)

	// Prefill so work can start immediately (true "burst").
	for i := 0; i < burst; i++ {
		ch <- struct{}{}
	}

	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				select {
				case ch <- struct{}{}:
				default:
				}
			}
		}
	}()

	return ch
}

type limiters struct {
	rateTok   <-chan struct{}
	stopRate  chan struct{}
	probeTok  <-chan struct{}
	stopProbe chan struct{}
}

func (l *limiters) Stop() {
	if l == nil {
		return
	}
	if l.stopRate != nil {
		close(l.stopRate)
		l.stopRate = nil
	}
	if l.stopProbe != nil {
		close(l.stopProbe)
		l.stopProbe = nil
	}
}

func (e *Engine) buildLimiters(req domain.StartRequest) limiters {
	var lim limiters

	if req.RateLimit > 0 {
		interval := time.Second / time.Duration(req.RateLimit)

		// strict: 1 (no burst); or small burst to smooth scheduling
		burst := minInt(req.RateLimit, 10)
		if burst < 1 {
			burst = 1
		}

		lim.stopRate = make(chan struct{})
		lim.rateTok = tokenBucket(interval, burst, lim.stopRate)
	}

	if req.Verbose {
		const maxProbeSSEPerSec = 50
		lim.stopProbe = make(chan struct{})
		lim.probeTok = tokenBucket(time.Second/time.Duration(maxProbeSSEPerSec), maxProbeSSEPerSec, lim.stopProbe)
	}

	return lim
}
