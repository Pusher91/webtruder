package scanner

import "strings"

func joinPath(basePath, add string) string {
	if basePath == "" || basePath == "/" {
		if strings.HasPrefix(add, "/") {
			return add
		}
		return "/" + add
	}
	bp := strings.TrimRight(basePath, "/")
	ap := add
	if !strings.HasPrefix(ap, "/") {
		ap = "/" + ap
	}
	return bp + ap
}
