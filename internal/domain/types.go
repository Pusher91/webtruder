package domain

type WordlistMeta struct {
	ID         string   `json:"id"`
	Names      []string `json:"names"`
	Bytes      int64    `json:"bytes"`
	UploadedAt string   `json:"uploadedAt"`
}

type StartRequest struct {
	ScanID      string   `json:"scanId,omitempty"`
	Targets     []string `json:"targets"`
	WordlistID  string   `json:"wordlistId"`
	Concurrency int      `json:"concurrency"`
	TimeoutMs   int      `json:"timeoutMs"`
	RateLimit   int      `json:"rateLimit"` // 0 = unlimited
	Tags        []string `json:"tags,omitempty"`
	Verbose     bool     `json:"verbose"`
	Proxy       string   `json:"proxy,omitempty"`
}

type Meta struct {
	ID            string              `json:"id"`
	StartedAt     string              `json:"startedAt"`
	FinishedAt    string              `json:"finishedAt,omitempty"`
	Targets       []string            `json:"targets"`
	WordlistID    string              `json:"wordlistId"`
	WordlistNames []string            `json:"wordlistNames,omitempty"`
	TotalPaths    int                 `json:"totalPaths"`
	Concurrency   int                 `json:"concurrency"`
	TimeoutMs     int                 `json:"timeoutMs"`
	RateLimit     int                 `json:"rateLimit"`
	Tags          []string            `json:"tags,omitempty"`
	Verbose       bool                `json:"verbose"`
	LogFile       string              `json:"logFile,omitempty"`
	Proxy         string              `json:"proxy,omitempty"`
	TotalRequests int64               `json:"totalRequests"`
	TotalFindings int64               `json:"totalFindings"`
	TotalErrors   int64               `json:"totalErrors"`
	Hosts         map[string]HostMeta `json:"hosts,omitempty"`
	Status        ScanStatus          `json:"status,omitempty"`
}

type HostMeta struct {
	Target     string     `json:"target"`
	Status     HostStatus `json:"status"`
	Checked    int64      `json:"checked"`
	Total      int64      `json:"total"`
	Findings   int64      `json:"findings"`
	Errors     int64      `json:"errors"`
	StartedAt  string     `json:"startedAt,omitempty"`
	FinishedAt string     `json:"finishedAt,omitempty"`
}

type ScanStartedMsg struct {
	ScanID     string   `json:"scanId"`
	Targets    []string `json:"targets"`
	WordlistID string   `json:"wordlistId"`
	TotalPaths int      `json:"totalPaths"`
	StartedAt  string   `json:"startedAt"`
	Verbose    bool     `json:"verbose"`
	LogFile    string   `json:"logFile,omitempty"`
	Tags       []string `json:"tags,omitempty"`
}

type HostStartedMsg struct {
	ScanID string `json:"scanId"`
	Target string `json:"target"`
	Total  int64  `json:"total"`
}

type HostProgressMsg struct {
	ScanID  string `json:"scanId"`
	Target  string `json:"target"`
	Percent int    `json:"percent"`
	RateRPS int    `json:"rate_rps"`
	Checked int64  `json:"checked"`
	Total   int64  `json:"total"`
	Errors  int64  `json:"errors"`
}

type Probe struct {
	ScanID      string `json:"scanId"`
	Target      string `json:"target"`
	Path        string `json:"path"`
	URL         string `json:"url"`
	Status      int    `json:"status"`
	Length      int64  `json:"length"`
	DurationMs  int64  `json:"durationMs"`
	ContentType string `json:"contentType,omitempty"`
	Location    string `json:"location,omitempty"`
	Error       string `json:"error,omitempty"`
	At          string `json:"at"`
}

type Finding struct {
	ScanID        string `json:"scanId"`
	Target        string `json:"target"`
	Path          string `json:"path"`
	URL           string `json:"url"`
	Status        int    `json:"status"`
	Length        int64  `json:"length"`
	Soft404Likely bool   `json:"soft404_likely"`
}
