package scanner

import (
	"context"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/Pusher91/webtruder/internal/domain"
)

func drainAndCount(r io.Reader) (n int64, err error) {
	return io.Copy(io.Discard, r)
}

type soft404Sig struct {
	byStatus map[int]map[int64]struct{}
}

func (s *soft404Sig) Add(status int, length int64) {
	if status <= 0 || length < 0 {
		return
	}
	if s.byStatus == nil {
		s.byStatus = make(map[int]map[int64]struct{}, 4)
	}
	m := s.byStatus[status]
	if m == nil {
		m = make(map[int64]struct{}, 8)
		s.byStatus[status] = m
	}
	m[length] = struct{}{}
}

func (s *soft404Sig) Match(status int, length int64) bool {
	if s == nil || s.byStatus == nil || status <= 0 || length < 0 {
		return false
	}
	m := s.byStatus[status]
	if m == nil {
		return false
	}
	_, ok := m[length]
	return ok
}

func soft404TestPaths(guid string) []string {
	return []string{
		"/" + guid,
		"/" + guid + "/",
		"/" + guid + ".html",
		"/" + guid + ".png",
	}
}

func (e *Engine) computeSoft404Baselines(
	ctx context.Context,
	rt *runtime,
	client *http.Client,
	timeout time.Duration,
	lim limiters,
	hosts []*hostCfg,
	workers int,
) {
	if len(hosts) == 0 {
		return
	}

	w := minInt(workers, len(hosts))
	if w < 1 {
		w = 1
	}

	ch := make(chan *hostCfg)
	var wg sync.WaitGroup
	wg.Add(w)

	for i := 0; i < w; i++ {
		go func() {
			defer wg.Done()
			for h := range ch {
				if h == nil || h.base == nil {
					continue
				}
				h.soft404 = e.calcSoft404Sig(ctx, rt, client, timeout, lim, h)
			}
		}()
	}

	for _, h := range hosts {
		select {
		case <-ctx.Done():
			close(ch)
			wg.Wait()
			return
		case ch <- h:
		}
	}
	close(ch)
	wg.Wait()

}

func (e *Engine) calcSoft404Sig(
	ctx context.Context,
	rt *runtime,
	client *http.Client,
	timeout time.Duration,
	lim limiters,
	h *hostCfg,
) soft404Sig {
	var sig soft404Sig
	if h == nil || h.base == nil {
		return sig
	}

	guid := domain.NewScanID()
	for _, p := range soft404TestPaths(guid) {
		if rt != nil && !rt.waitIfPaused() {
			return sig
		}

		if lim.rateTok != nil {
			select {
			case <-lim.rateTok:
			case <-ctx.Done():
				return sig
			}
		}

		select {
		case h.sem <- struct{}{}:
		case <-ctx.Done():
			return sig
		}

		u := *h.base
		u.Path = joinPath(h.base.Path, p)
		out := performProbe(ctx, client, timeout, u.String())

		<-h.sem

		if out.wasCanceled {
			return sig
		}
		if out.errStr == "" {
			sig.Add(out.status, out.length)
		}
	}

	return sig
}
