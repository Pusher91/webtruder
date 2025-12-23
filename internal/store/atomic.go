package store

import (
	"encoding/json"
	"os"
	"runtime"
)

func writeJSONAtomic(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}

	if err := os.Rename(tmp, path); err == nil {
		return nil
	}

	defer os.Remove(tmp)

	if runtime.GOOS == "windows" {
		_ = os.Remove(path)
		return os.Rename(tmp, path)
	}
	return os.Rename(tmp, path)
}
