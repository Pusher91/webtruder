package scanner

import "context"

func feedJobsInterleaved(ctx context.Context, rt *runtime, hosts []*hostCfg, paths []string, jobs chan<- job) {
	defer close(jobs)
	for _, p := range paths {
		for _, h := range hosts {
			if rt != nil {
				if !rt.waitIfPaused() {
					return
				}
			}
			select {
			case <-ctx.Done():
				return
			case jobs <- job{host: h, path: p}:
			}
		}
	}
}
