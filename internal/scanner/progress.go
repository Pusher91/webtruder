package scanner

import (
	"time"

	"github.com/Pusher91/webtruder/internal/domain"
)

type hostAgg struct {
	done     int64
	lastDone int64
	lastT    time.Time
	findings int64
	errs     int64
	finished bool
}

func (e *Engine) maybeEmitProgress(scanID string, h *hostCfg, a *hostAgg, now time.Time) (bool, domain.HostProgressMsg) {
	if h == nil || a == nil {
		return false, domain.HostProgressMsg{}
	}
	d := a.done
	total := h.total

	if a.lastT.IsZero() {
		a.lastT = now
		a.lastDone = d
	}

	if now.Sub(a.lastT) < 500*time.Millisecond && d != total {
		return false, domain.HostProgressMsg{}
	}

	delta := d - a.lastDone
	secs := now.Sub(a.lastT).Seconds()
	rps := 0
	if secs > 0 {
		rps = int(float64(delta) / secs)
	}
	pct := 0
	if total > 0 {
		pct = int((d * 100) / total)
	}

	msg := domain.HostProgressMsg{
		ScanID:  scanID,
		Target:  h.target,
		Percent: pct,
		RateRPS: rps,
		Checked: d,
		Total:   total,
		Errors:  a.errs,
	}

	a.lastDone = d
	a.lastT = now
	return true, msg
}

func (e *Engine) finalizeStoppedHostsAgg(
	scanID string,
	hosts []*hostCfg,
	aggs map[string]*hostAgg,
	meta *domain.Meta,
	totalFindings, totalErrors int64,
	markDirty func(),
) {
	if meta == nil {
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	for _, h := range hosts {
		if h == nil {
			continue
		}
		a := aggs[h.target]
		if a == nil || a.finished {
			continue
		}

		a.finished = true

		checked := a.done
		total := h.total
		errs := a.errs
		findings := a.findings

		pct := 0
		if total > 0 {
			pct = int((checked * 100) / total)
		}

		e.emit("host_progress", domain.HostProgressMsg{
			ScanID:  scanID,
			Target:  h.target,
			Percent: pct,
			RateRPS: 0,
			Checked: checked,
			Total:   total,
			Errors:  errs,
		})

		hm := meta.Hosts[h.target]
		hm.Status = domain.HostStatusStopped
		hm.Checked = checked
		hm.Total = total
		hm.Findings = findings
		hm.Errors = errs
		hm.FinishedAt = now
		meta.Hosts[h.target] = hm
		meta.TotalFindings = totalFindings
		meta.TotalErrors = totalErrors

		if markDirty != nil {
			markDirty()
		}
	}
}
