package scanner

import "github.com/Pusher91/webtruder/internal/domain"

func applyScanStatus(meta *domain.Meta, status domain.ScanStatus) {
	if meta == nil {
		return
	}
	meta.Status = status

	if meta.Hosts == nil {
		return
	}
	for k, h := range meta.Hosts {
		if h.Status == domain.HostStatusCompleted || h.Status == domain.HostStatusError {
			continue
		}
		switch status {
		case domain.ScanStatusPaused:
			if h.Status == domain.HostStatusRunning {
				h.Status = domain.HostStatusPaused
			}
		case domain.ScanStatusRunning:
			if h.Status == domain.HostStatusPaused {
				h.Status = domain.HostStatusRunning
			}
		case domain.ScanStatusStopped:
			h.Status = domain.HostStatusStopped
		}
		meta.Hosts[k] = h
	}
}
