package server

import (
	"embed"
	"io/fs"
	"net/http"
	"path/filepath"

	"github.com/Pusher91/webtruder/internal/domain"
	"github.com/Pusher91/webtruder/internal/scanner"
	"github.com/Pusher91/webtruder/internal/server/api"
	"github.com/Pusher91/webtruder/internal/store"
)

//go:embed web/*
var embedded embed.FS

type Server struct {
	dataDir           string
	broker            *broker
	wordlists         *store.WordlistStore
	scanRepo          *store.ScanRepo
	engine            *scanner.Engine
	publicIPv4Enabled bool
}

func New() *Server { return NewWithDataDir("webtruder_data") }

func NewWithDataDir(dataDir string) *Server {
	ws, err := store.NewWordlistStore(filepath.Join(dataDir, "wordlists"))
	if err != nil {
		panic(err)
	}
	ss, err := store.NewScanStore(filepath.Join(dataDir, "scans"))
	if err != nil {
		panic(err)
	}

	s := &Server{
		dataDir:   dataDir,
		broker:    newBroker(),
		wordlists: ws,
		scanRepo:  store.NewScanRepo(dataDir, ss),
	}

	s.engine = scanner.New(ws, s.scanRepo, s)
	return s
}

func (s *Server) SetPublicIPv4Enabled(v bool) {
	if s != nil {
		s.publicIPv4Enabled = v
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	sub, _ := fs.Sub(embedded, "web")
	mux.Handle("/", http.FileServer(http.FS(sub)))

	mux.HandleFunc("/events", s.handleEvents)

	handleAPIMethod(mux, "/api/scan/start", http.MethodPost, 2<<20, s.startScanAPI)
	handleAPIMethod(mux, "/api/wordlists/upload", http.MethodPost, 50<<20, s.uploadWordlistAPI)

	mux.HandleFunc("/api/wordlists", api.Wrap(s.wordlistsAPI))
	mux.HandleFunc("/api/wordlists/exists", api.WrapMethod(http.MethodGet, s.wordlistExistsAPI))

	mux.HandleFunc("/api/scans", api.WrapMethod(http.MethodGet, s.scansListAPI))
	mux.HandleFunc("/api/scans/state", api.WrapMethod(http.MethodGet, s.scanStateAPI))
	mux.HandleFunc("/api/scans/findings", api.WrapMethod(http.MethodGet, s.scanFindingsAPI))
	mux.HandleFunc("/api/scans/log", api.WrapMethod(http.MethodGet, s.scanLogAPI))
	mux.HandleFunc("/api/scans/errors", api.WrapMethod(http.MethodGet, s.scanErrorsAPI))

	mux.HandleFunc("/api/scans/pause", api.WrapMethod(http.MethodPost, s.pauseScanAPI))
	mux.HandleFunc("/api/scans/resume", api.WrapMethod(http.MethodPost, s.resumeScanAPI))
	mux.HandleFunc("/api/scans/stop", api.WrapMethod(http.MethodPost, s.stopScanAPI))
	mux.HandleFunc("/api/scans/delete", api.WrapMethod(http.MethodPost, s.deleteScanAPI))

	mux.HandleFunc("/api/netinfo", api.WrapMethod(http.MethodGet, s.netInfoAPI))

	return mux
}

func handleAPIMethod(mux *http.ServeMux, path, method string, maxBytes int64, h api.Handler) {
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		if maxBytes > 0 {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		}
		api.WrapMethod(method, h)(w, r)
	})
}

type startResp struct {
	Accepted bool     `json:"accepted"`
	Targets  int      `json:"targets"`
	Tags     []string `json:"tags"`
	ScanID   string   `json:"scanId"`
}

func (s *Server) DataDir() string { return s.dataDir }

func (s *Server) startScanAPI(r *http.Request) (any, *api.APIError) {
	var req domain.StartRequest
	if apiErr := api.ReadJSON(r, &req); apiErr != nil {
		return nil, apiErr
	}

	if details := req.NormalizeAndValidate(); len(details) > 0 {
		return nil, api.ValidationError(details)
	}

	req.ScanID = domain.NewScanID()

	s.emit("scan_start_requested", map[string]any{
		"targets":     req.Targets,
		"wordlistId":  req.WordlistID,
		"concurrency": req.Concurrency,
		"timeoutMs":   req.TimeoutMs,
		"rateLimit":   req.RateLimit,
		"tags":        req.Tags,
		"verbose":     req.Verbose,
		"proxy":       req.Proxy,
	})

	s.engine.Start(req)

	return startResp{
		Accepted: true,
		Targets:  len(req.Targets),
		Tags:     req.Tags,
		ScanID:   req.ScanID,
	}, nil
}
