import { ensureServer, resetRuntimeState, addProbe } from "../state/mutations.js";

export function startSSE({ state, ui, data, onScanDone } = {}) {
    const es = new EventSource("/events");

    es.addEventListener("ready", () => ui.setConn("connected"));

    es.addEventListener("scan_started", (e) => {
        const m = JSON.parse(e.data || "{}");

        data.stopLogTail();

        resetRuntimeState(state);
        ui.clearScanUI();

        state.scanId = m.scanId || "";
        state.verbose = !!m.verbose;

        state.findingsMode = "stream";
        state.findingsStreamItems = [];
        state.findingsStreamTotal = 0;
        state.findingsKnownStatuses = new Set();
        state.findingsTotalAll = 0;
        state.findingsTotalLowerBound = false;

        ui.setConn(`connected - scan running (${(m.targets && m.targets.length) || 0} targets)`);

        if (Array.isArray(m.targets)) {
            for (const t of m.targets) ensureServer(state, t);
        }

        if (state.scanId) {
            state.scans = (state.scans || []).filter((x) => x.id !== state.scanId);
            state.scans.unshift({
                id: state.scanId,
                active: true,
                status: "running",
                startedAt: m.startedAt || new Date().toISOString(),
                finishedAt: "",
                targetsCount: Array.isArray(m.targets) ? m.targets.length : 0,
                tags: Array.isArray(m.tags) ? m.tags : [],
                totalFindings: 0,
                totalErrors: 0,
                verbose: !!m.verbose,
            });
        }

        ui.renderScansList();
        ui.renderServersTable();
        ui.renderRunningPanel();
        ui.updateBadges();

        ui.renderFindingsTable();
        ui.renderFindingsPager();
    });

    es.addEventListener("host_started", (e) => {
        const m = JSON.parse(e.data || "{}");
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
        if (!m.target) return;

        const s = ensureServer(state, m.target);
        s.findings = (s.findings || 0) + 1;

        if (state.scanId) {
            const it = (state.scans || []).find((x) => x.id === state.scanId);
            if (it) it.totalFindings = (Number(it.totalFindings) || 0) + 1;
        }

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

        ui.renderScansList();
        ui.renderServersTable();
        ui.renderRunningPanel();
    });

    es.addEventListener("probe_error", (e) => {
        const m = JSON.parse(e.data || "{}");
        if (!m.target) return;

        const s = ensureServer(state, m.target);
        s.lastProbeAt = Date.now();
        s.errors = (s.errors || 0) + 1;

        if (state.scanId) {
            const it = (state.scans || []).find((x) => x.id === state.scanId);
            if (it) it.totalErrors = (Number(it.totalErrors) || 0) + 1;
        }

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

        ui.renderScansList();
        ui.scheduleProbeRender();
    });

    es.addEventListener("probe", (e) => {
        if (!state.verbose) return;

        const m = JSON.parse(e.data || "{}");
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

    es.addEventListener("scan_done", async () => {
        data.refreshLogs().catch(() => {});
        ui.setConn("connected - scan complete");
        ui.renderServersTable();
        ui.renderRunningPanel();
        ui.updateBadges();

        await onScanDone?.();
    });

    es.onerror = () => ui.setConn("disconnected (will retry)");
}
