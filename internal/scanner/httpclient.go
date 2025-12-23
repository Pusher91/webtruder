package scanner

import (
	"context"
	"crypto/tls"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

func doReq(ctx context.Context, client *http.Client, timeout time.Duration, method, fullURL string) (*http.Response, context.CancelFunc, error) {
	reqCtx := ctx
	cancel := func() {}
	if timeout > 0 {
		reqCtx, cancel = context.WithTimeout(ctx, timeout)
	}

	req, err := http.NewRequestWithContext(reqCtx, method, fullURL, nil)
	if err != nil {
		cancel()
		return nil, func() {}, err
	}
	req.Header.Set("Accept-Encoding", "identity")

	resp, err := client.Do(req)
	if err != nil {
		cancel()
		return nil, func() {}, err
	}
	return resp, cancel, nil
}

func doGet(ctx context.Context, client *http.Client, timeout time.Duration, fullURL string) (*http.Response, context.CancelFunc, error) {
	return doReq(ctx, client, timeout, http.MethodGet, fullURL)
}

func newHTTPClient(perHostConcurrency int, proxyStr string) *http.Client {
	if perHostConcurrency <= 0 {
		perHostConcurrency = 1
	}

	d := &net.Dialer{
		Timeout:   5 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	tr := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           d.DialContext,
		ForceAttemptHTTP2:     true,
		DisableCompression:    true,
		MaxIdleConns:          4096,
		MaxIdleConnsPerHost:   maxInt(32, perHostConcurrency*2),
		MaxConnsPerHost:       maxInt(64, perHostConcurrency*4),
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,

		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true,
		},
	}

	if strings.TrimSpace(proxyStr) != "" {
		if u, err := url.Parse(proxyStr); err == nil && u.Scheme != "" && u.Host != "" {
			tr.Proxy = http.ProxyURL(u)
		}
	}

	return &http.Client{
		Transport: tr,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func protoLabel(resp *http.Response) string {
	if resp == nil {
		return "HTTP/1.1"
	}
	if resp.ProtoMajor == 2 {
		return "HTTP/2"
	}
	if resp.ProtoMajor == 1 {
		return "HTTP/1." + strconv.Itoa(resp.ProtoMinor)
	}
	if resp.Proto != "" {
		return resp.Proto
	}
	return "HTTP/1.1"
}

func responseBytes(resp *http.Response, bodyBytes int64) int64 {
	if resp == nil {
		if bodyBytes >= 0 {
			return bodyBytes
		}
		return -1
	}
	if bodyBytes < 0 {
		return -1
	}

	n := int64(len(protoLabel(resp)) + 1 + len(resp.Status) + 2)

	for k, vs := range resp.Header {
		for _, v := range vs {
			n += int64(len(k) + 2 + len(v) + 2)
		}
	}

	n += 2
	n += bodyBytes
	return n
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
