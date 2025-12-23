package scanner

import "github.com/Pusher91/webtruder/internal/domain"

func (e *Engine) initMeta(scanID, startedAt string, req domain.StartRequest, paths []string, wlNames []string, logPath string) domain.Meta {
	return domain.Meta{
		ID:            scanID,
		StartedAt:     startedAt,
		Targets:       req.Targets,
		WordlistID:    req.WordlistID,
		WordlistNames: wlNames,
		TotalPaths:    len(paths),
		Concurrency:   req.Concurrency,
		TimeoutMs:     req.TimeoutMs,
		RateLimit:     req.RateLimit,
		Tags:          req.Tags,
		Verbose:       req.Verbose,
		LogFile:       logPath,
		TotalRequests: int64(len(paths)) * int64(len(req.Targets)),
		Hosts:         map[string]domain.HostMeta{},
		Status:        domain.ScanStatusRunning,
		Proxy:         req.Proxy,
	}
}
