package scanner

import "context"

func (e *Engine) loadWordlist(ctx context.Context, wordlistID string) ([]string, []string, error) {
	paths, err := e.wordlists.WordlistLines(ctx, wordlistID)
	if err != nil {
		return nil, nil, err
	}
	wlNames := []string{}
	if m, metaErr := e.wordlists.WordlistMeta(ctx, wordlistID); metaErr == nil && m != nil && len(m.Names) > 0 {
		wlNames = m.Names
	}
	return paths, wlNames, nil
}
