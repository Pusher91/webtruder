import {ensureServer, resetRuntimeState} from "../state/mutations.js";

export function createScansData(state, apiFetch) {
    function unwrap(resp) {
        return resp?.data ?? resp ?? {};
    }

    function asMaybeInt(x) {
        if (x == null) return null;
        const n = Number.parseInt(String(x), 10);
        return Number.isFinite(n) ? n : null;
    }

    async function refreshScansList() {
        const resp = await apiFetch("/api/scans");
        const d = unwrap(resp);
        state.scans = d.items ?? d.scans ?? d.results ?? [];
        return state.scans;
    }

    function pickDefaultScanId(items) {
        if (!Array.isArray(items) || items.length === 0) return "";
        const running = items.find((x) => x.active && x.status === "running");
        return (running && running.id) || items[0].id;
    }

    async function loadScanState(scanId) {
        const resp = await apiFetch(`/api/scans/state?scanId=${encodeURIComponent(scanId)}`);
        const d = unwrap(resp);

        const meta = d.meta ?? d ?? {};
        const hosts = meta.hosts ?? d.hosts ?? {};

        resetRuntimeState(state);
        state.scanId = scanId;

        state.verbose = !!(meta.verbose ?? d.verbose);
        state.findingsMode = "paged";

        // Try to seed total findings across the scan so the Findings header is correct
        // even before paging (and even if /api/findings doesn't return a total).
        const fromMeta =
            asMaybeInt(meta.totalFindings ?? meta.findingsTotal ?? meta.total ?? null) ??
            asMaybeInt(d.totalFindings ?? d.findingsTotal ?? d.total ?? null);

        const fromScanList = asMaybeInt((state.scans || []).find((x) => x.id === scanId)?.totalFindings ?? null);

        const seeded = fromMeta ?? fromScanList ?? null;
        if (seeded != null) {
            state.findingsTotalAll = seeded;
            state.findingsTotalLowerBound = false;
            state.findingsStreamTotal = seeded;
        }

        const targets = meta.targets ?? d.targets ?? [];
        if (Array.isArray(targets)) {
            for (const t of targets) ensureServer(state, t);
        }

        for (const k of Object.keys(hosts || {})) {
            const h = hosts[k] || {};
            const target = h.target || k;
            const s = ensureServer(state, target);
            s.status = h.status || s.status;
            s.checked = Number(h.checked || 0);
            s.total = Number(h.total || 0);
            s.findings = Number(h.findings || 0);
            s.errors = Number(h.errors || 0);
            s.percent = (s.total > 0) ? Math.floor((s.checked * 100) / s.total) : 0;
            s.rate = 0;
        }

        return meta;
    }

    async function pauseScan(scanId) {
        await apiFetch("/api/scans/pause", {method: "POST", body: {scanId}});
    }

    async function resumeScan(scanId) {
        await apiFetch("/api/scans/resume", {method: "POST", body: {scanId}});
    }

    async function stopScan(scanId) {
        await apiFetch("/api/scans/stop", {method: "POST", body: {scanId}});
    }

    async function deleteScan(scanId) {
        await apiFetch("/api/scans/delete", {method: "POST", body: {scanId}});
    }

    return {
        refreshScansList,
        pickDefaultScanId,
        loadScanState,
        pauseScan,
        resumeScan,
        stopScan,
        deleteScan,
    };
}
