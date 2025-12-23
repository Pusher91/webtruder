package domain

type ScanStatus string
type HostStatus string

const (
	ScanStatusRunning   ScanStatus = "running"
	ScanStatusPaused    ScanStatus = "paused"
	ScanStatusStopped   ScanStatus = "stopped"
	ScanStatusCompleted ScanStatus = "completed"
	ScanStatusError     ScanStatus = "error"
)

const (
	HostStatusRunning   HostStatus = "running"
	HostStatusPaused    HostStatus = "paused"
	HostStatusStopped   HostStatus = "stopped"
	HostStatusCompleted HostStatus = "completed"
	HostStatusError     HostStatus = "error"
)
