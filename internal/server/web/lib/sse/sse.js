import { ensureServer, resetRuntimeState, addProbe } from "../state/mutations.js";

export function startSSE({ state, ui, data, onScanDone } = {}) {
    const es = new EventSource("/events");
    let preferredScanId = "";
    let manualSelectionLockUntil = 0;

    function normalizeScanId(v) {
        return String(v || "").trim();
    }

    function currentScanId() {
        return normalizeScanId(state.scanId);
    }

    function isEventForCurrentScan(m) {
        const scanId = normalizeScanId(m?.scanId);
        const cur = currentScanId();
        return !!scanId && !!cur && scanId === cur;
    }

    function isEventForPreferredScan(m) {
        const scanId = normalizeScanId(m?.scanId);
        return !!scanId && !!preferredScanId && scanId === preferredScanId;
    }

    function asInt(v, fallback = 0) {
        const n = Number.parseInt(String(v ?? ""), 10);
        return Number.isFinite(n) ? n : fallback;
    }

    function clampPct(n) {
        if (n < 0) return 0;
        if (n > 100) return 100;
        return n;
    }

    function progressStore() {
        if (!(state.scanProgressByScan instanceof Map)) {
            state.scanProgressByScan = new Map();
        }
        return state.scanProgressByScan;
    }

    function scanHostProgress(scanId) {
        const key = normalizeScanId(scanId);
        if (!key) return new Map();
        const store = progressStore();
        let byHost = store.get(key);
        if (!(byHost instanceof Map)) {
            byHost = new Map();
            store.set(key, byHost);
        }
        return byHost;
    }

    function findScan(scanId) {
        const key = normalizeScanId(scanId);
        return (state.scans || []).find((x) => x && x.id === key) || null;
    }

    function upsertScan(scanId, patch = {}) {
        const key = normalizeScanId(scanId);
        if (!key) return null;
        const items = Array.isArray(state.scans) ? state.scans : [];
        let it = items.find((x) => x && x.id === key);
        if (!it) {
            it = {
                id: key,
                status: "running",
                active: true,
                targetsDone: 0,
                targetsTotal: 0,
                progressPct: 0,
            };
            items.unshift(it);
            state.scans = items;
        }
        Object.assign(it, patch);
        return it;
    }

    function recalcScanProgress(scanId) {
        const it = findScan(scanId);
        if (!it) return;

        const hosts = scanHostProgress(scanId);
        const fromItemTargets = asInt(it.targetsTotal || it.targetsCount || (Array.isArray(it.targets) ? it.targets.length : 0), 0);
        const targetsTotal = Math.max(fromItemTargets, hosts.size);

        let trackedDone = 0;
        let trackedPctSum = 0;
        for (const h of hosts.values()) {
            const pct = clampPct(asInt(h.percent, 0));
            trackedPctSum += pct;
            if (pct >= 100) trackedDone++;
        }

        const prevPct = clampPct(asInt(it.progressPct ?? it.progressPercent, 0));
        const prevDone = asInt(it.targetsDone, 0);

        let computedPct = targetsTotal > 0 ? Math.floor(trackedPctSum / targetsTotal) : prevPct;
        computedPct = Math.max(prevPct, computedPct);

        let computedDone = Math.max(prevDone, trackedDone);

        const stRaw = String(it.status || "").toLowerCase();
        if (stRaw === "completed") {
            computedPct = 100;
            if (targetsTotal > 0) computedDone = targetsTotal;
        }

        if (targetsTotal > 0 && computedDone > targetsTotal) computedDone = targetsTotal;

        it.targetsTotal = targetsTotal;
        it.targetsDone = computedDone;
        it.progressPct = clampPct(computedPct);
    }

    function updateScanHostProgress(scanId, target, { percent, checked, total } = {}) {
        const id = normalizeScanId(scanId);
        const host = String(target || "").trim();
        if (!id || !host) return;

        const it = upsertScan(id, { active: true });
        if (!it) return;
        const stRaw = String(it.status || "").toLowerCase();
        if (stRaw !== "completed" && stRaw !== "stopped") {
            it.status = "running";
        }

        const byHost = scanHostProgress(id);
        const prev = byHost.get(host) || { percent: 0, checked: 0, total: 0 };

        const totalN = asInt(total, asInt(prev.total, 0));
        const checkedN = asInt(checked, asInt(prev.checked, 0));

        let pctN = clampPct(asInt(percent, asInt(prev.percent, 0)));
        if (percent == null && totalN > 0) {
            pctN = clampPct(Math.floor((checkedN * 100) / totalN));
        }

        byHost.set(host, {
            percent: pctN,
            checked: checkedN,
            total: totalN,
        });

        recalcScanProgress(id);
    }

    document.addEventListener("scan_start_accepted", (e) => {
        preferredScanId = normalizeScanId(e?.detail?.scanId);
    });

    document.addEventListener("scan_selected", () => {
        // Manual selection should win over any pending auto-follow target.
        preferredScanId = "";
        manualSelectionLockUntil = Date.now() + 5000;
    });

    es.addEventListener("ready", () => ui.setConn("connected"));

    es.addEventListener("scan_started", (e) => {
        const m = JSON.parse(e.data || "{}");
        const scanId = normalizeScanId(m.scanId);
        if (!scanId) return;

        const targets = Array.isArray(m.targets) ? m.targets : [];
        for (const t of targets) {
            updateScanHostProgress(scanId, t, { percent: 0, checked: 0, total: 0 });
        }
        upsertScan(scanId, {
            active: true,
            status: "running",
            startedAt: m.startedAt || new Date().toISOString(),
            finishedAt: "",
            targetsCount: targets.length,
            targetsTotal: targets.length,
            targetsDone: 0,
            progressPct: 0,
            tags: Array.isArray(m.tags) ? m.tags : [],
            totalFindings: 0,
            totalErrors: 0,
            verbose: !!m.verbose,
        });
        ui.scheduleScansRender();

        const cur = currentScanId();
        const isPreferred = preferredScanId === scanId;
        const manualLockActive = Date.now() < manualSelectionLockUntil;
        if (manualLockActive && !isPreferred) {
            return;
        }
        if (cur && cur !== scanId && !isPreferred) {
            return;
        }
        if (isPreferred) {
            preferredScanId = "";
        }

        data.stopLogTail();

        resetRuntimeState(state);
        ui.clearScanUI();

        state.scanId = scanId;
        state.verbose = !!m.verbose;

        state.findingsMode = "stream";
        state.findingsStreamItems = [];
        state.findingsStreamTotal = 0;
        state.findingsKnownStatuses = new Set();
        state.findingsTotalAll = 0;
        state.findingsTotalLowerBound = false;

        ui.setConn(`connected - scan running (${(m.targets && m.targets.length) || 0} targets)`);

        if (targets.length > 0) {
            for (const t of targets) ensureServer(state, t);
        }

        ui.scheduleScansRender();
        ui.renderServersTable();
        ui.renderRunningPanel();
        ui.updateBadges();

        ui.renderFindingsTable();
        ui.renderFindingsPager();
    });

    es.addEventListener("host_started", (e) => {
        const m = JSON.parse(e.data || "{}");
        updateScanHostProgress(m?.scanId, m?.target, { checked: 0, total: m?.total, percent: 0 });
        ui.scheduleScansRender();

        if (!isEventForCurrentScan(m)) return;
        if (!m.target) return;
        const s = ensureServer(state, m.target);
        s.status = "running";
        s.total = Number(m.total || s.total || 0);
        s.lastProbeAt = Date.now();

        ui.renderServersTable();
        ui.renderRunningPanel();
        ui.updateBadges();
    });

    es.addEventListener("host_progress", (e) => {
        const m = JSON.parse(e.data || "{}");
        updateScanHostProgress(m?.scanId, m?.target, {
            percent: m?.percent,
            checked: m?.checked,
            total: m?.total,
        });
        ui.scheduleScansRender();

        if (!isEventForCurrentScan(m)) return;
        if (!m.target) return;

        const s = ensureServer(state, m.target);
        s.status = (Number(m.percent) >= 100) ? "completed" : "running";
        s.percent = Number(m.percent || 0);
        s.rate = Number(m.rate_rps || 0);
        s.checked = Number(m.checked || 0);
        s.total = Number(m.total || s.total || 0);
        s.errors = Number(m.errors || s.errors || 0);
        s.lastProbeAt = Date.now();

        ui.renderServersTable();
        ui.renderRunningPanel();
        ui.updateBadges();
    });

    es.addEventListener("finding", (e) => {
        const m = JSON.parse(e.data || "{}");
        const scanId = normalizeScanId(m?.scanId);
        if (scanId) {
            const it = upsertScan(scanId);
            if (it) it.totalFindings = (Number(it.totalFindings) || 0) + 1;
        }

        if (!isEventForCurrentScan(m)) {
            if (scanId) ui.scheduleScansRender();
            return;
        }
        if (!m.target) return;

        const s = ensureServer(state, m.target);
        s.findings = (s.findings || 0) + 1;

        state.findingsStreamTotal = (Number(state.findingsStreamTotal) || 0) + 1;
        state.findingsTotalAll = state.findingsStreamTotal;
        state.findingsTotalLowerBound = false;

        if (state.findingsMode === "stream") {
            state.findingsStreamItems.unshift(m);
            if (state.findingsStreamItems.length > (state.findingsStreamMax || 500)) {
                state.findingsStreamItems.length = state.findingsStreamMax || 500;
            }
            ui.scheduleFindingsRender();
        }

        ui.scheduleScansRender();
        ui.renderServersTable();
        ui.renderRunningPanel();
    });

    es.addEventListener("probe_error", (e) => {
        const m = JSON.parse(e.data || "{}");
        const scanId = normalizeScanId(m?.scanId);
        if (scanId) {
            const it = upsertScan(scanId);
            if (it) it.totalErrors = (Number(it.totalErrors) || 0) + 1;
        }

        if (!isEventForCurrentScan(m)) {
            if (scanId) ui.scheduleScansRender();
            return;
        }
        if (!m.target) return;

        const s = ensureServer(state, m.target);
        s.lastProbeAt = Date.now();
        s.errors = (s.errors || 0) + 1;

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

        ui.scheduleScansRender();
        ui.scheduleProbeRender();
    });

    es.addEventListener("probe", (e) => {
        if (!state.verbose) return;

        const m = JSON.parse(e.data || "{}");
        if (!isEventForCurrentScan(m)) return;
        if (!m.target) return;

        const s = ensureServer(state, m.target);
        s.lastProbeAt = Date.now();

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

        ui.scheduleProbeRender();
    });

    es.addEventListener("scan_done", async (e) => {
        const m = JSON.parse(e.data || "{}");
        const scanId = normalizeScanId(m?.scanId);
        const errMsg = String(m?.error || "").trim();

        if (scanId) {
            const it = upsertScan(scanId, { active: false });
            if (it) {
                const stRaw = String(it.status || "").toLowerCase();
                if (!errMsg) {
                    if (stRaw === "running" || stRaw === "paused" || stRaw === "") it.status = "completed";
                    it.progressPct = 100;
                    if ((it.targetsTotal || 0) > 0) it.targetsDone = it.targetsTotal;
                } else if (stRaw === "running" || stRaw === "paused" || stRaw === "") {
                    it.status = "stopped";
                }
            }
            ui.scheduleScansRender();
        }

        const forCurrent = isEventForCurrentScan(m);
        const forPreferred = isEventForPreferredScan(m);
        if (!forCurrent && !forPreferred) {
            data.refreshScansList()
                .then(() => ui.scheduleScansRender())
                .catch(() => {});
            return;
        }
        if (forPreferred) preferredScanId = "";

        data.refreshLogs().catch(() => {});
        if (errMsg) ui.setConn(`connected - scan failed (${errMsg})`);
        else ui.setConn("connected - scan complete");
        ui.renderServersTable();
        ui.renderRunningPanel();
        ui.updateBadges();

        await onScanDone?.();
    });

    es.onerror = () => ui.setConn("disconnected (will retry)");
}
