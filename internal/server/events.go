package server

import (
	"fmt"
	"net/http"
	"time"
)

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	// optional: tell EventSource how long to wait before retrying if it DOES disconnect
	fmt.Fprint(w, "retry: 2000\n\n")
	fmt.Fprint(w, "event: ready\ndata: {}\n\n")
	flusher.Flush()

	ctx := r.Context()
	ch := s.broker.subscribe()
	defer s.broker.unsubscribe(ch)

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case <-ticker.C:
			// comment/heartbeat frame keeps intermediaries from timing out the connection
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()

		case msg, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", msg.Event, msg.Data)
			flusher.Flush()
		}
	}
}
