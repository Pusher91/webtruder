package scanner

import (
	"context"
	"net/url"
	"strings"
	"time"

	"github.com/Pusher91/webtruder/internal/domain"
)

type hostCfg struct {
	target  string
	base    *url.URL
	sem     chan struct{}
	total   int64
	soft404 soft404Sig
}

func (e *Engine) buildHosts(
	ctx context.Context,
	scanID string,
	targets []string,
	totalPaths int,
	perHostCap int,
	meta *domain.Meta,
	markDirty func(),
) []*hostCfg {
	hosts := make([]*hostCfg, 0, len(targets))
	total := int64(totalPaths)

	for _, t := range targets {
		target := strings.TrimSpace(t)
		e.emit("host_started", domain.HostStartedMsg{ScanID: scanID, Target: target, Total: total})

		if ctx.Err() != nil {
			break
		}

		base, perr := url.Parse(target)
		if perr != nil || base.Scheme == "" || base.Host == "" {
			e.emit("host_progress", domain.HostProgressMsg{
				ScanID:  scanID,
				Target:  target,
				Percent: 100,
				RateRPS: 0,
				Checked: total,
				Total:   total,
				Errors:  0,
			})

			if meta != nil {
				now := time.Now().UTC().Format(time.RFC3339)
				meta.Hosts[target] = domain.HostMeta{
					Target:     target,
					Status:     domain.HostStatusError,
					Checked:    total,
					Total:      total,
					Findings:   0,
					Errors:     0,
					StartedAt:  now,
					FinishedAt: now,
				}
				if markDirty != nil {
					markDirty()
				}
			}
			continue
		}

		h := &hostCfg{
			target: target,
			base:   base,
			sem:    make(chan struct{}, perHostCap),
			total:  total,
		}
		hosts = append(hosts, h)

		if meta != nil {
			meta.Hosts[target] = domain.HostMeta{
				Target:    target,
				Status:    domain.HostStatusRunning,
				Checked:   0,
				Total:     total,
				Findings:  0,
				Errors:    0,
				StartedAt: time.Now().UTC().Format(time.RFC3339),
			}
			if markDirty != nil {
				markDirty()
			}
		}
	}

	return hosts
}

func perHostCapFor(workers, targets int) int {
	if workers <= 0 {
		workers = 1
	}
	if targets <= 0 {
		targets = 1
	}
	// If scanning a single host, allow full concurrency.
	if targets == 1 {
		return workers
	}
	// Otherwise distribute workers across hosts (ceil).
	c := (workers + targets - 1) / targets
	if c < 1 {
		c = 1
	}
	return c
}

func sanitizeWorkers(n int) int {
	if n <= 0 {
		return 1
	}
	return n
}
