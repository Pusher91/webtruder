// ./internal/server/web/lib/data/findings.js
export function createFindingsData(state, apiFetch) {
    function unwrap(resp) {
        return resp?.data ?? resp ?? {};
    }

    function asInt(x, def = 0) {
        const n = Number.parseInt(String(x ?? ""), 10);
        return Number.isFinite(n) ? n : def;
    }

    function asMaybeInt(x) {
        if (x == null) return null;
        const n = Number.parseInt(String(x), 10);
        return Number.isFinite(n) ? n : null;
    }

    function pickTotalFromResponse(d) {
        return asMaybeInt(
            d.total ??
            d.totalCount ??
            d.totalItems ??
            d.countTotal ??
            d.totalFindings ??
            d.findingsTotal ??
            d.total_results ??
            null
        );
    }

    function updateFindingsTotals({ totalFromServer = null } = {}) {
        if (totalFromServer != null) {
            state.findingsTotalAll = totalFromServer;
            state.findingsTotalLowerBound = false;
            state.findingsStreamTotal = totalFromServer;
            return;
        }

        const cur = state.findingsTotalAll;
        const hasCur = (typeof cur === "number") && Number.isFinite(cur) && cur >= 0;
        if (hasCur) return;

        state.findingsTotalAll = null;
        state.findingsTotalLowerBound = false;
    }

    function getFindingsQuery() {
        const q = (state.findingsQuery && typeof state.findingsQuery === "object") ? state.findingsQuery : {};
        return {
            q: String(q.q ?? "").trim(),
            statusInclude: String(q.statusInclude ?? "").trim(),
            statusExclude: String(q.statusExclude ?? "").trim(),
            lengthInclude: String(q.lengthInclude ?? "").trim(),
            lengthExclude: String(q.lengthExclude ?? "").trim(),
        };
    }

    function buildURL({ cursor = 0, limit = 500 } = {}) {
        const BASE = "/api/scans/findings";
        const fq = getFindingsQuery();

        let url =
            `${BASE}?scanId=${encodeURIComponent(state.scanId)}` +
            `&cursor=${encodeURIComponent(String(cursor ?? 0))}` +
            `&limit=${encodeURIComponent(String(limit ?? 500))}`;

        if (fq.q) url += `&q=${encodeURIComponent(fq.q)}`;
        if (fq.statusInclude) url += `&statusInclude=${encodeURIComponent(fq.statusInclude)}`;
        if (fq.statusExclude) url += `&statusExclude=${encodeURIComponent(fq.statusExclude)}`;
        if (fq.lengthInclude) url += `&lengthInclude=${encodeURIComponent(fq.lengthInclude)}`;
        if (fq.lengthExclude) url += `&lengthExclude=${encodeURIComponent(fq.lengthExclude)}`;

        return url;
    }

    async function fetchPage({ cursor = 0, limit = 500 } = {}) {
        if (!state.scanId) {
            return { items: [], nextCursor: cursor, hasMore: false };
        }

        const resp = await apiFetch(buildURL({ cursor, limit }));
        const d = unwrap(resp);

        const items = d.items ?? d.results ?? [];
        const nextCursor = d.nextCursor ?? d.next ?? d.cursorNext ?? cursor;

        const hasMore =
            (typeof d.hasMore === "boolean")
                ? d.hasMore
                : (String(nextCursor) !== String(cursor));

        const totalFromServer = pickTotalFromResponse(d);
        updateFindingsTotals({ totalFromServer });

        return { items, nextCursor, hasMore };
    }

    async function loadFindingsFirstPage({ limit = 500 } = {}) {
        state.findingsLimit = asInt(limit, 500);
        state.findingsCursor = 0;
        state.findingsNextCursor = 0;
        state.findingsPrevCursors = [];
        state.findingsHasMore = false;

        const page = await fetchPage({ cursor: 0, limit: state.findingsLimit });
        state.findingsItems = page.items;
        state.findingsNextCursor = page.nextCursor ?? 0;
        state.findingsHasMore = !!page.hasMore;

        state.findingsTotalAll = Number.isFinite(state.findingsTotalAll) ? state.findingsTotalAll : null;
        state.findingsTotalLowerBound = !!state.findingsTotalLowerBound;

        return state.findingsItems;
    }

    async function loadFindingsNextPage() {
        if (!state.scanId) return [];

        const next = state.findingsNextCursor ?? 0;
        const cur = state.findingsCursor ?? 0;

        state.findingsPrevCursors = Array.isArray(state.findingsPrevCursors) ? state.findingsPrevCursors : [];
        state.findingsPrevCursors.push(cur);

        state.findingsCursor = next;

        const page = await fetchPage({ cursor: state.findingsCursor, limit: state.findingsLimit });
        state.findingsItems = page.items;
        state.findingsNextCursor = page.nextCursor ?? 0;
        state.findingsHasMore = !!page.hasMore;

        return state.findingsItems;
    }

    async function loadFindingsPrevPage() {
        if (!state.scanId) return [];

        state.findingsPrevCursors = Array.isArray(state.findingsPrevCursors) ? state.findingsPrevCursors : [];
        if (state.findingsPrevCursors.length === 0) return state.findingsItems || [];

        const prev = state.findingsPrevCursors.pop();
        state.findingsCursor = prev ?? 0;

        const page = await fetchPage({ cursor: state.findingsCursor, limit: state.findingsLimit });
        state.findingsItems = page.items;
        state.findingsNextCursor = page.nextCursor ?? 0;
        state.findingsHasMore = !!page.hasMore;

        return state.findingsItems;
    }

    async function reloadFindingsPage() {
        if (!state.scanId) return [];

        const page = await fetchPage({ cursor: state.findingsCursor ?? 0, limit: state.findingsLimit });
        state.findingsItems = page.items;
        state.findingsNextCursor = page.nextCursor ?? 0;
        state.findingsHasMore = !!page.hasMore;

        return state.findingsItems;
    }

    async function appendFindingsNextPage() {
        if (!state.scanId) return [];
        if (!state.findingsHasMore) return state.findingsItems || [];

        const cursor = state.findingsNextCursor ?? 0;
        const page = await fetchPage({ cursor, limit: state.findingsLimit });

        const curItems = Array.isArray(state.findingsItems) ? state.findingsItems : [];
        const nextItems = Array.isArray(page.items) ? page.items : [];
        state.findingsItems = curItems.concat(nextItems);

        state.findingsNextCursor = page.nextCursor ?? cursor;
        state.findingsHasMore = !!page.hasMore;

        return state.findingsItems;
    }

    // Keep API stable for existing callers; do a safe sequential scan.
    async function seekFindingsNextMatch({ matchFn, maxPages = 40 } = {}) {
        if (!state.scanId) return { found: false, advanced: false };
        let pagesScanned = 0;
        let advanced = false;

        while (pagesScanned < maxPages && state.findingsHasMore) {
            pagesScanned++;
            advanced = true;

            await loadFindingsNextPage();
            const items = Array.isArray(state.findingsItems) ? state.findingsItems : [];
            if (!matchFn || matchFn(items)) return { found: true, advanced: true };

            if (!state.findingsHasMore) break;
        }

        return { found: false, advanced };
    }

    return {
        loadFindingsFirstPage,
        loadFindingsNextPage,
        loadFindingsPrevPage,
        reloadFindingsPage,
        appendFindingsNextPage,
        seekFindingsNextMatch,
    };
}
