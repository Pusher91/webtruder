package domain

import "regexp"

var (
	ScanIDRe     = regexp.MustCompile(`^[a-f0-9]{32}$`)
	WordlistIDRe = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

func IsValidScanID(id string) bool     { return ScanIDRe.MatchString(id) }
func IsValidWordlistID(id string) bool { return WordlistIDRe.MatchString(id) }
