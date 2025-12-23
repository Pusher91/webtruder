package server

import (
	"net/url"
	"strconv"
	"strings"

	"github.com/Pusher91/webtruder/internal/domain"
	"github.com/Pusher91/webtruder/internal/server/api"
)

type statusMatcher struct {
	enabled bool
	set     map[int]struct{}
	ranges  [][2]int // inclusive
}

func (m statusMatcher) Match(v int) bool {
	if !m.enabled {
		return true
	}
	if m.set != nil {
		if _, ok := m.set[v]; ok {
			return true
		}
	}
	for _, r := range m.ranges {
		if v >= r[0] && v <= r[1] {
			return true
		}
	}
	return false
}

func parseStatusMatcher(raw, field string) (statusMatcher, *api.APIError) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return statusMatcher{}, nil
	}

	out := statusMatcher{enabled: true}
	toks := splitCSV(raw)
	for _, tok := range toks {
		t := strings.ToLower(strings.TrimSpace(tok))
		if t == "" {
			continue
		}

		// 2xx, 3xx, 4xx, 5xx
		if len(t) == 3 && t[1] == 'x' && t[2] == 'x' && t[0] >= '1' && t[0] <= '5' {
			lo := int(t[0]-'0') * 100
			hi := lo + 99
			out.ranges = append(out.ranges, [2]int{lo, hi})
			continue
		}

		// 300-399
		if i := strings.IndexByte(t, '-'); i >= 0 {
			a := strings.TrimSpace(t[:i])
			b := strings.TrimSpace(t[i+1:])
			lo, err1 := strconv.Atoi(a)
			hi, err2 := strconv.Atoi(b)
			if err1 != nil || err2 != nil || lo < 100 || hi > 599 || lo > hi {
				return statusMatcher{}, api.ValidationError(map[string]string{
					field: "invalid range: " + tok,
				})
			}
			out.ranges = append(out.ranges, [2]int{lo, hi})
			continue
		}

		// exact: 200,404,429
		v, err := strconv.Atoi(t)
		if err != nil || v < 100 || v > 599 {
			return statusMatcher{}, api.ValidationError(map[string]string{
				field: "invalid status code: " + tok,
			})
		}
		if out.set == nil {
			out.set = make(map[int]struct{}, 16)
		}
		out.set[v] = struct{}{}
	}

	return out, nil
}

type lengthMatcher struct {
	enabled bool
	set     map[int64]struct{}
	ranges  [][2]int64 // inclusive
}

func (m lengthMatcher) Match(v int64) bool {
	if !m.enabled {
		return true
	}
	if v < 0 {
		return false
	}
	if m.set != nil {
		if _, ok := m.set[v]; ok {
			return true
		}
	}
	for _, r := range m.ranges {
		if v >= r[0] && v <= r[1] {
			return true
		}
	}
	return false
}

func parseLengthMatcher(raw, field string) (lengthMatcher, *api.APIError) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return lengthMatcher{}, nil
	}

	out := lengthMatcher{enabled: true}
	toks := splitCSV(raw)
	for _, tok := range toks {
		t := strings.TrimSpace(tok)
		if t == "" {
			continue
		}

		// range: 100-200
		if i := strings.IndexByte(t, '-'); i >= 0 {
			a := strings.TrimSpace(t[:i])
			b := strings.TrimSpace(t[i+1:])
			lo, err1 := strconv.ParseInt(a, 10, 64)
			hi, err2 := strconv.ParseInt(b, 10, 64)
			if err1 != nil || err2 != nil || lo < 0 || hi < 0 || lo > hi {
				return lengthMatcher{}, api.ValidationError(map[string]string{
					field: "invalid range: " + tok,
				})
			}
			out.ranges = append(out.ranges, [2]int64{lo, hi})
			continue
		}

		// exact: 0,1234
		v, err := strconv.ParseInt(t, 10, 64)
		if err != nil || v < 0 {
			return lengthMatcher{}, api.ValidationError(map[string]string{
				field: "invalid length: " + tok,
			})
		}
		if out.set == nil {
			out.set = make(map[int64]struct{}, 16)
		}
		out.set[v] = struct{}{}
	}

	return out, nil
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func searchTokensFromQuery(q url.Values) []string {
	raw := strings.TrimSpace(q.Get("q"))
	if raw == "" {
		raw = strings.TrimSpace(q.Get("search"))
	}
	if raw == "" {
		return nil
	}
	parts := strings.Fields(raw)
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.ToLower(strings.TrimSpace(p))
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return nil
	}
	if len(out) > 20 {
		out = out[:20]
	}
	return out
}

func buildFindingKeep(q url.Values) (func(domain.Finding) bool, *api.APIError) {
	toks := searchTokensFromQuery(q)

	stInc, apiErr := parseStatusMatcher(q.Get("statusInclude"), "statusInclude")
	if apiErr != nil {
		return nil, apiErr
	}
	stExc, apiErr := parseStatusMatcher(q.Get("statusExclude"), "statusExclude")
	if apiErr != nil {
		return nil, apiErr
	}

	lenInc, apiErr := parseLengthMatcher(q.Get("lengthInclude"), "lengthInclude")
	if apiErr != nil {
		return nil, apiErr
	}
	lenExc, apiErr := parseLengthMatcher(q.Get("lengthExclude"), "lengthExclude")
	if apiErr != nil {
		return nil, apiErr
	}

	anyFilter := len(toks) > 0 || stInc.enabled || stExc.enabled || lenInc.enabled || lenExc.enabled
	if !anyFilter {
		return nil, nil
	}

	return func(f domain.Finding) bool {
		// q= token AND across (target|path|url), case-insensitive substring match
		if len(toks) > 0 {
			t0 := strings.ToLower(f.Target)
			p0 := strings.ToLower(f.Path)
			u0 := strings.ToLower(f.URL)
			for _, tok := range toks {
				if !strings.Contains(t0, tok) && !strings.Contains(p0, tok) && !strings.Contains(u0, tok) {
					return false
				}
			}
		}

		// includes first, then excludes win on overlap
		if stInc.enabled && !stInc.Match(f.Status) {
			return false
		}
		if stExc.enabled && stExc.Match(f.Status) {
			return false
		}

		if lenInc.enabled && !lenInc.Match(f.Length) {
			return false
		}
		if lenExc.enabled && lenExc.Match(f.Length) {
			return false
		}

		return true
	}, nil
}
