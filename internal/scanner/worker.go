package scanner

import (
	"context"
	"errors"
	"net/http"
	"time"
)

type job struct {
	host *hostCfg
	path string
}

type probeOutcome struct {
	status    int
	bodyBytes int64
	length    int64
	ct        string
	loc       string
	errStr    string
	durMs     int64

	wasCanceled bool
}

type probeResult struct {
	host *hostCfg
	path string
	url  string
	out  probeOutcome
	at   string
}

func performProbe(ctx context.Context, client *http.Client, timeout time.Duration, fullURL string) probeOutcome {
	t0 := time.Now()
	resp, cancel, reqErr := doGet(ctx, client, timeout, fullURL)

	out := probeOutcome{
		status:    0,
		bodyBytes: -1,
		length:    -1,
		ct:        "",
		loc:       "",
		errStr:    "",
		durMs:     0,
	}

	defer func() {
		out.durMs = time.Since(t0).Milliseconds()
		if cancel != nil {
			cancel()
		}
	}()

	if reqErr != nil {
		out.errStr = reqErr.Error()
		if errors.Is(reqErr, context.Canceled) && ctx.Err() != nil {
			out.wasCanceled = true
		}
		if resp != nil && resp.Body != nil {
			_ = resp.Body.Close()
		}
		return out
	}

	out.status = resp.StatusCode
	out.ct = resp.Header.Get("Content-Type")
	out.loc = resp.Header.Get("Location")

	if resp.Body != nil {
		nRead, readErr := drainAndCount(resp.Body)
		_ = resp.Body.Close()
		if readErr != nil {
			out.errStr = "body read: " + readErr.Error()
		} else {
			out.bodyBytes = nRead
		}
	}

	// Use body size for size-based filtering/soft-404 detection
	out.length = out.bodyBytes
	return out
}

func (e *Engine) workerLoop(
	ctx context.Context,
	scanID string,
	client *http.Client,
	timeout time.Duration,
	lim limiters,
	jobs <-chan job,
	results chan<- probeResult,
) {
	for {
		select {
		case <-ctx.Done():
			return

		case j, ok := <-jobs:
			if !ok {
				return
			}
			if j.host == nil || j.host.base == nil {
				continue
			}

			select {
			case j.host.sem <- struct{}{}:
			case <-ctx.Done():
				return
			}

			if lim.rateTok != nil {
				select {
				case <-lim.rateTok:
				case <-ctx.Done():
					<-j.host.sem
					return
				}
			}

			u := *j.host.base
			u.Path = joinPath(j.host.base.Path, j.path)
			fullURL := u.String()

			out := performProbe(ctx, client, timeout, fullURL)
			if out.wasCanceled {
				<-j.host.sem
				return
			}

			<-j.host.sem

			res := probeResult{
				host: j.host,
				path: j.path,
				url:  fullURL,
				out:  out,
				at:   time.Now().UTC().Format(time.RFC3339Nano),
			}

			select {
			case results <- res:
			case <-ctx.Done():
				return
			}
		}
	}
}
