package server

func (s *Server) Emit(event string, payload any) {
	s.emit(event, payload)
}
