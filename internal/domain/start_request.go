package domain

import (
	"net/url"
	"strings"
)

func (r *StartRequest) NormalizeAndValidate() map[string]string {
	details := map[string]string{}
	if r == nil {
		details["request"] = "required"
		return details
	}

	targetsProvided := len(r.Targets) > 0
	tagsProvided := len(r.Tags) > 0

	r.ScanID = strings.TrimSpace(r.ScanID)
	r.WordlistID = strings.TrimSpace(r.WordlistID)
	r.Proxy = strings.TrimSpace(r.Proxy)

	r.Targets = trimNonEmpty(r.Targets)
	r.Tags = trimNonEmpty(r.Tags)

	if len(r.Targets) == 0 {
		if !targetsProvided {
			details["targets"] = "required"
		} else {
			details["targets"] = "must contain at least one non-empty entry"
		}
	}

	if r.WordlistID == "" {
		details["wordlistId"] = "required"
	} else if !IsValidWordlistID(r.WordlistID) {
		details["wordlistId"] = "must be a 64-char lowercase hex sha256"
	}

	if r.Concurrency <= 0 {
		details["concurrency"] = "must be > 0"
	}

	if r.TimeoutMs <= 0 {
		details["timeoutMs"] = "must be > 0"
	}

	if r.RateLimit < 0 {
		details["rateLimit"] = "must be >= 0"
	}

	if tagsProvided && len(r.Tags) == 0 {
		details["tags"] = "must contain at least one non-empty tag"
	}

	if r.Proxy != "" {
		u, err := url.Parse(r.Proxy)
		if err != nil || u.Scheme == "" || u.Host == "" {
			details["proxy"] = "must be a valid proxy URL (e.g. http://127.0.0.1:8080)"
		} else if u.Scheme != "http" && u.Scheme != "https" {
			details["proxy"] = "scheme must be http or https"
		}
	}

	return details
}

func trimNonEmpty(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
