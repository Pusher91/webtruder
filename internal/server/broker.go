package server

import (
	"encoding/json"
	"sync"
)

type message struct {
	Event string
	Data  string
}

type broker struct {
	mu   sync.Mutex
	subs map[chan message]struct{}
}

func newBroker() *broker {
	return &broker{subs: make(map[chan message]struct{})}
}

func (b *broker) subscribe() chan message {
	ch := make(chan message, 64)
	b.mu.Lock()
	b.subs[ch] = struct{}{}
	b.mu.Unlock()
	return ch
}

func (b *broker) unsubscribe(ch chan message) {
	b.mu.Lock()
	delete(b.subs, ch)
	b.mu.Unlock()
	close(ch)
}

func (b *broker) publish(msg message) {
	b.mu.Lock()
	for ch := range b.subs {
		select {
		case ch <- msg:
		default:
		}
	}
	b.mu.Unlock()
}

func (s *Server) emit(event string, payload any) {
	b, _ := json.Marshal(payload)
	s.broker.publish(message{Event: event, Data: string(b)})
}
