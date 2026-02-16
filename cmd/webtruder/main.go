package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/Pusher91/webtruder/internal/server"
)

var version = "dev" // overridden at build time via -ldflags "-X main.version=<value>"

func main() {
	showVersion := flag.Bool("version", false, "print version and exit")
	enableIPify := flag.Bool("enable-ipify", false, "enable public IPv4 lookup via ipify for the web UI")
	addr := flag.String("addr", "127.0.0.1:8787", "listen address")
	dataDir := flag.String("data-dir", "webtruder_data", "directory to store scan/wordlist data")
	flag.Parse()

	if *showVersion {
		fmt.Println(version)
		return
	}

	s := server.NewWithDataDir(*dataDir)
	s.SetVersion(version)
	s.SetPublicIPv4Enabled(*enableIPify)

	httpServer := &http.Server{
		Addr:              *addr,
		Handler:           s.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("Webtruder starting up. Version: %s", version)
	log.Printf("Saving data to directory: %s", *dataDir)
	if *enableIPify {
		log.Printf("Public IPv4 lookup via ipify: enabled")
	} else {
		log.Printf("Public IPv4 lookup via ipify: disabled")
	}
	log.Printf("Use -h to check available flags.")
	log.Printf("Listening on http://%s", *addr)
	log.Fatal(httpServer.ListenAndServe())
}
