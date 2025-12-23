package api

type Error struct {
	Code    string            `json:"code"`              // stable machine code
	Message string            `json:"message"`           // safe UI message
	Details map[string]string `json:"details,omitempty"` // optional per-field validation errors
}

type Response struct {
	OK    bool   `json:"ok"`
	Data  any    `json:"data,omitempty"`
	Error *Error `json:"error,omitempty"`
}
