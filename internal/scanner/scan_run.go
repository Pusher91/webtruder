package scanner

import (
	"context"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/Pusher91/webtruder/internal/domain"
)

func (e *Engine) runScan(rt *runtime, req domain.StartRequest) {
	scanID := req.ScanID
	if scanID == "" {
		scanID = domain.NewScanID()
		req.ScanID = scanID
	}

	ctx := context.Background()
	if rt != nil {
		ctx = rt.ctx
	}

	paths, wlNames, err := e.loadWordlist(ctx, req.WordlistID)
	if err != nil || len(paths) == 0 {
		e.emit("scan_done", map[string]any{"scanId": scanID, "error": "failed to read wordlist"})
		return
	}

	rec, err := e.scans.OpenRecorder(ctx, scanID, req.Verbose)
	if err != nil {
		e.emit("scan_done", map[string]any{"scanId": scanID, "error": "failed to open scan recorder"})
		return
	}
	defer rec.Close()

	probePath := rec.ProbePath()
	logPath := probePath
	if !req.Verbose {
		logPath = ""
	}

	lim := e.buildLimiters(req)
	defer lim.Stop()

	startedAt := time.Now().UTC().Format(time.RFC3339)
	meta := e.initMeta(scanID, startedAt, req, paths, wlNames, logPath)

	dirty := false
	markDirty := func() { dirty = true }

	flush := func(force bool) {
		if !force && !dirty {
			return
		}
		_ = e.scans.WriteMeta(context.Background(), scanID, meta)
		dirty = false
	}

	var statusCh <-chan domain.ScanStatus
	if rt != nil {
		statusCh = rt.statusCh
		if st := rt.desiredStatusSnapshot(); st != "" {
			applyScanStatus(&meta, st)
			markDirty()
		}
	}

	flushTicker := time.NewTicker(500 * time.Millisecond)
	defer flushTicker.Stop()

	flush(true)

	e.emit("scan_started", domain.ScanStartedMsg{
		ScanID:     scanID,
		Targets:    req.Targets,
		WordlistID: req.WordlistID,
		TotalPaths: len(paths),
		StartedAt:  startedAt,
		Verbose:    req.Verbose,
		LogFile:    logPath,
		Tags:       req.Tags,
	})

	timeout := time.Duration(req.TimeoutMs) * time.Millisecond
	workers := sanitizeWorkers(req.Concurrency)
	perHostCap := perHostCapFor(workers, len(req.Targets))
	client := newHTTPClient(perHostCap, req.Proxy)

	hosts := e.buildHosts(ctx, scanID, req.Targets, len(paths), perHostCap, &meta, markDirty)

	// NEW: per-host soft-404 baseline probes (GUID, GUID/, GUID.html, GUID.png)
	e.computeSoft404Baselines(ctx, rt, client, timeout, lim, hosts, workers)

	// Keep buffers low so pause takes effect quickly.
	jobs := make(chan job, workers)
	results := make(chan probeResult, workers)

	var wg sync.WaitGroup
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func() {
			defer wg.Done()
			e.workerLoop(ctx, scanID, client, timeout, lim, jobs, results)
		}()
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	go feedJobsInterleaved(ctx, rt, hosts, paths, jobs)

	aggs := make(map[string]*hostAgg, len(hosts))
	for _, h := range hosts {
		if h == nil {
			continue
		}
		aggs[h.target] = &hostAgg{lastT: time.Now()}
	}

	var totalFindings int64
	var totalErrors int64

	for {
		select {
		case st := <-statusCh:
			applyScanStatus(&meta, st)
			markDirty()
			flush(true)

		case <-flushTicker.C:
			flush(false)

		case res, ok := <-results:
			if !ok {
				client.CloseIdleConnections()

				stopped := rt != nil && rt.ctx.Err() != nil
				if stopped {
					e.finalizeStoppedHostsAgg(scanID, hosts, aggs, &meta, totalFindings, totalErrors, markDirty)
				}

				meta.FinishedAt = time.Now().UTC().Format(time.RFC3339)
				meta.TotalFindings = totalFindings
				meta.TotalErrors = totalErrors
				if meta.Status != domain.ScanStatusStopped {
					if stopped {
						meta.Status = domain.ScanStatusStopped
					} else {
						meta.Status = domain.ScanStatusCompleted
					}
				}

				markDirty()
				flush(true)

				e.emit("scan_done", map[string]any{"scanId": scanID})
				return
			}

			if res.host == nil || res.host.base == nil {
				continue
			}
			a := aggs[res.host.target]
			if a == nil {
				a = &hostAgg{lastT: time.Now()}
				aggs[res.host.target] = a
			}

			now := time.Now()
			a.done++

			out := res.out

			isFinding := out.errStr == "" &&
				out.status != 0 &&
				out.status != http.StatusNotFound &&
				out.status != http.StatusTooManyRequests &&
				out.status < 500

			if isFinding && res.host != nil && res.host.soft404.Match(out.status, out.length) {
				isFinding = false
			}

			isErrReq := out.errStr != "" ||
				out.status == http.StatusTooManyRequests ||
				(out.status >= 500 && out.status <= 599)

			if isErrReq {
				if out.errStr == "" && out.status != 0 {
					out.errStr = http.StatusText(out.status)
					if out.errStr == "" {
						out.errStr = "HTTP " + strconv.Itoa(out.status)
					}
				}

				a.errs++
				totalErrors++
			}

			if isFinding {
				a.findings++
				totalFindings++

				fm := domain.Finding{
					ScanID:        scanID,
					Target:        res.host.target,
					Path:          res.path,
					URL:           res.url,
					Status:        out.status,
					Length:        out.length,
					Soft404Likely: false,
				}

				_ = rec.WriteFinding(fm)
				e.emit("finding", fm)
			}

			pm := domain.Probe{
				ScanID:      scanID,
				Target:      res.host.target,
				Path:        res.path,
				URL:         res.url,
				Status:      out.status,
				Length:      out.length,
				DurationMs:  out.durMs,
				ContentType: out.ct,
				Location:    out.loc,
				Error:       out.errStr,
				At:          res.at,
			}

			if isErrReq || req.Verbose {
				_ = rec.WriteProbe(pm)
			}

			if isErrReq {
				e.emit("probe_error", pm)
			}

			if req.Verbose && !isErrReq {
				if lim.probeTok != nil {
					select {
					case <-lim.probeTok:
						e.emit("probe", pm)
					default:
					}
				}
			}

			emitProg, prog := e.maybeEmitProgress(scanID, res.host, a, now)
			if emitProg {
				e.emit("host_progress", prog)

				hm := meta.Hosts[res.host.target]
				hm.Checked = a.done
				hm.Findings = a.findings
				hm.Errors = a.errs
				meta.Hosts[res.host.target] = hm
				meta.TotalFindings = totalFindings
				meta.TotalErrors = totalErrors
				markDirty()

			} else if isErrReq {
				hm := meta.Hosts[res.host.target]
				hm.Errors = a.errs
				meta.Hosts[res.host.target] = hm
				meta.TotalErrors = totalErrors
				markDirty()
			}

			if a.done == res.host.total && !a.finished {
				a.finished = true

				stoppedNow := rt != nil && rt.ctx.Err() != nil
				statusStr := domain.HostStatusCompleted
				if stoppedNow {
					statusStr = domain.HostStatusStopped
				}

				hm := meta.Hosts[res.host.target]
				hm.Status = statusStr
				hm.Checked = a.done
				hm.Total = res.host.total
				hm.Findings = a.findings
				hm.Errors = a.errs
				hm.FinishedAt = time.Now().UTC().Format(time.RFC3339)
				meta.Hosts[res.host.target] = hm
				meta.TotalFindings = totalFindings
				meta.TotalErrors = totalErrors
				markDirty()
			}
		}
	}
}
