import { addProbe, ensureServer } from "../state/mutations.js";

export function createLogsData(state, apiFetch) {
    let logTailTimer = null;

    function stopLogTail() {
        if (logTailTimer) clearInterval(logTailTimer);
        logTailTimer = null;
    }

    function unwrap(resp) {
        return resp?.data ?? resp ?? {};
    }

    function parseAtMs(at) {
        const t = Date.parse(String(at || ""));
        return Number.isFinite(t) ? t : 0;
    }

    async function refreshLogs({ limit = 500 } = {}) {
        if (!state.scanId) return 0;

        const base = state.verbose ? "/api/scans/log" : "/api/scans/errors";
        const resp = await apiFetch(
            `${base}?scanId=${encodeURIComponent(state.scanId)}&cursor=${encodeURIComponent(String(state.logCursor ?? 0))}&limit=${encodeURIComponent(String(limit))}`
        );

        const data = unwrap(resp);
        const items = data.items ?? data.results ?? [];
        const next = data.nextCursor ?? data.next ?? data.cursorNext ?? state.logCursor ?? 0;

        for (let i = 0; i < items.length; i++) {
            const m = items[i] || {};

            addProbe(state, {
                target: m.target,
                path: m.path || "",
                url: m.url || "",
                status: m.status || 0,
                length: m.length || 0,
                durationMs: m.durationMs || 0,
                error: m.error || "",
                at: m.at || "",
            });

            if (m.target) {
                const s = ensureServer(state, m.target);
                const atMs = parseAtMs(m.at);
                const bump = atMs || Date.now();
                s.lastProbeAt = Math.max(Number(s.lastProbeAt || 0), bump);
            }
        }

        state.logCursor = next;
        return items.length;
    }

    async function loadLogsUntilFull({ maxItems = 2000 } = {}) {
        if (!state.scanId) return;

        let count = 0;
        while (count < maxItems) {
            const added = await refreshLogs({ limit: 500 });
            count += added;
            if (added === 0) break;
        }
    }

    function startLogTail(onTick) {
        stopLogTail();
        refreshLogs().then(() => onTick?.()).catch(() => {});
        logTailTimer = setInterval(() => {
            refreshLogs().then(() => onTick?.()).catch(() => {});
        }, 750);
    }

    return {
        refreshLogs,
        loadLogsUntilFull,
        startLogTail,
        stopLogTail,
    };
}
