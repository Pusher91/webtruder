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
        // Support a few common shapes without requiring server changes.
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

        // If we already have a known total (seeded from scan meta/list), keep it.
        const cur = state.findingsTotalAll;
        const hasCur = (typeof cur === "number") && Number.isFinite(cur) && cur >= 0;
        if (hasCur) return;

        state.findingsTotalAll = null;
        state.findingsTotalLowerBound = false;
    }

    async function fetchPage({cursor = 0, limit = 500} = {}) {
        if (!state.scanId) {
            return {items: [], nextCursor: cursor, hasMore: false};
        }

        const BASE = "/api/scans/findings";
        const url =
            `${BASE}?scanId=${encodeURIComponent(state.scanId)}` +
            `&cursor=${encodeURIComponent(String(cursor ?? 0))}` +
            `&limit=${encodeURIComponent(String(limit ?? 500))}`;

        const resp = await apiFetch(url);
        const d = unwrap(resp);

        const items = d.items ?? d.results ?? [];
        const nextCursor = d.nextCursor ?? d.next ?? (d.cursorNext ?? 0);

        // Prefer explicit hasMore; otherwise infer.
        const hasMore =
            (typeof d.hasMore === "boolean")
                ? d.hasMore
                : (items.length >= asInt(limit, 500) && String(nextCursor) !== String(cursor));

    const totalFromServer = pickTotalFromResponse(d);
    updateFindingsTotals({
            cursor,
            itemsLen: items.length,
            hasMore,
            totalFromServer,
        });

        return {items, nextCursor, hasMore};
    }

    async function loadFindingsFirstPage({limit = 500} = {}) {
        state.findingsLimit = asInt(limit, 500);
        state.findingsCursor = 0;
        state.findingsNextCursor = 0;
        state.findingsPrevCursors = [];
        state.findingsHasMore = false;

        const page = await fetchPage({cursor: 0, limit: state.findingsLimit});
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

        // push current cursor onto back-stack
        state.findingsPrevCursors = Array.isArray(state.findingsPrevCursors) ? state.findingsPrevCursors : [];
        state.findingsPrevCursors.push(cur);

        state.findingsCursor = next;

        const page = await fetchPage({cursor: state.findingsCursor, limit: state.findingsLimit});
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

        const page = await fetchPage({cursor: state.findingsCursor, limit: state.findingsLimit});
        state.findingsItems = page.items;
        state.findingsNextCursor = page.nextCursor ?? 0;
        state.findingsHasMore = !!page.hasMore;

        return state.findingsItems;
    }

    async function reloadFindingsPage() {
        if (!state.scanId) return [];

        const page = await fetchPage({cursor: state.findingsCursor ?? 0, limit: state.findingsLimit});
        state.findingsItems = page.items;
        state.findingsNextCursor = page.nextCursor ?? 0;
        state.findingsHasMore = !!page.hasMore;

        return state.findingsItems;
    }

    return {
        loadFindingsFirstPage,
        loadFindingsNextPage,
        loadFindingsPrevPage,
        reloadFindingsPage,
    };
}
