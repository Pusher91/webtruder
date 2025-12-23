package server

import (
	"context"
	"io"
	"net"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/Pusher91/webtruder/internal/server/api"
)

type netInfoResp struct {
	LocalIPv4s        []string `json:"localIPv4s"`
	OutboundLocalIPv4 string   `json:"outboundLocalIPv4,omitempty"`
	PublicIPv4        string   `json:"publicIPv4,omitempty"`
	PublicIPv4Enabled bool     `json:"publicIPv4Enabled"`
}

func (s *Server) netInfoAPI(r *http.Request) (any, *api.APIError) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	local := localIPv4s()
	outbound := outboundLocalIPv4()

	pubEnabled := s != nil && s.publicIPv4Enabled
	pub := ""
	if pubEnabled {
		pub = fetchPublicIPv4(ctx)
	}

	return netInfoResp{
		LocalIPv4s:        local,
		OutboundLocalIPv4: outbound,
		PublicIPv4:        pub,
		PublicIPv4Enabled: pubEnabled,
	}, nil
}

func localIPv4s() []string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return []string{}
	}

	seen := map[string]struct{}{}
	out := make([]string, 0, 8)

	for _, a := range addrs {
		ipnet, ok := a.(*net.IPNet)
		if !ok || ipnet == nil {
			continue
		}
		ip := ipnet.IP
		if ip == nil {
			continue
		}
		ip4 := ip.To4()
		if ip4 == nil {
			continue
		}

		// Skip loopback and link-local
		if ip4[0] == 127 {
			continue
		}
		if ip4[0] == 169 && ip4[1] == 254 {
			continue
		}

		s := ip4.String()
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}

	sort.Strings(out)
	return out
}

func outboundLocalIPv4() string {
	// Uses the kernel routing table to pick an egress interface/IP without sending packets.
	c, err := net.DialTimeout("udp", "8.8.8.8:80", 750*time.Millisecond)
	if err != nil {
		return ""
	}
	defer c.Close()

	la, ok := c.LocalAddr().(*net.UDPAddr)
	if !ok || la == nil || la.IP == nil {
		return ""
	}
	ip4 := la.IP.To4()
	if ip4 == nil {
		return ""
	}
	if ip4[0] == 127 || (ip4[0] == 169 && ip4[1] == 254) {
		return ""
	}
	return ip4.String()
}

func fetchPublicIPv4(ctx context.Context) string {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api4.ipify.org?format=text", nil)
	if err != nil {
		return ""
	}

	cl := &http.Client{Timeout: 2 * time.Second}
	resp, err := cl.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ""
	}

	b, err := io.ReadAll(io.LimitReader(resp.Body, 128))
	if err != nil {
		return ""
	}

	s := strings.TrimSpace(string(b))
	ip := net.ParseIP(s)
	if ip == nil {
		return ""
	}
	ip4 := ip.To4()
	if ip4 == nil {
		return ""
	}
	return ip4.String()
}
