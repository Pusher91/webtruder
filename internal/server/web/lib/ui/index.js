// ./internal/server/web/lib/ui/index.js
import { el } from "./dom.js";

import { createServersPanel } from "./servers.js";
import { createFindingsPanel } from "./findings.js";
import { createRequestLogPanel } from "./requestLog.js";
import { createScansPanel } from "./scans.js";
import { createNetinfoPanel } from "./netinfo.js";
import { bindPanelsPersist } from "./panelsPersist.js";
import { fmtWhen } from "./format.js";

export function createUI(state) {
    const servers = createServersPanel(state);
    const findings = createFindingsPanel(state);
    const requestLog = createRequestLogPanel(state);
    const scans = createScansPanel(state);
    const netinfo = createNetinfoPanel(state);

    let probeRenderTimer = null;
    function scheduleProbeRender() {
        if (probeRenderTimer) return;
        probeRenderTimer = setTimeout(() => {
            probeRenderTimer = null;
            renderRequestLog();
            renderRunningPanel();
        }, 100);
    }

    let findingsRenderTimer = null;
    function scheduleFindingsRender() {
        if (findingsRenderTimer) return;
        findingsRenderTimer = setTimeout(() => {
            findingsRenderTimer = null;
            renderFindingsTable();
        }, 75);
    }

    function setConn(text) {
        const c = el("conn");
        if (c) c.textContent = text;
    }

    function updateBadges() {
        servers.updateBadges();
    }

    function renderRunningPanel() {
        servers.renderRunningPanel();
    }

    function renderServersTable() {
        servers.renderServersTable();
    }

    function renderFindingsTable() {
        findings.renderFindingsTable();
    }

    function renderFindingsPager() {
        findings.renderFindingsPager();
    }

    function renderRequestLog() {
        requestLog.renderRequestLog();
    }

    function renderNetInfo(d) {
        netinfo.renderNetInfo(d);
    }

    function renderActiveScanContext() {
        const titleEl = el("activeScanTitle");
        const metaEl = el("activeScanMeta");
        if (!titleEl && !metaEl) return;

        const scanId = String(state.scanId || "");
        if (!scanId) {
            if (titleEl) titleEl.textContent = "No scan selected";
            if (metaEl) metaEl.textContent = "";
            return;
        }

        const items = Array.isArray(state.scans) ? state.scans : [];
        const it = items.find((x) => x && x.id === scanId) || null;

        if (titleEl) titleEl.textContent = `Scan: ${scanId}`;

        if (!metaEl) return;
        if (!it) {
            metaEl.textContent = "This scan is not in the current list.";
            return;
        }

        const stRaw = String(it.status || "").toLowerCase();
        const active = !!it.active;
        const orphaned = !active && (stRaw === "running" || stRaw === "paused");
        const showStatus = orphaned ? "stopped" : (it.status || "-");

        const targetsCount = (it.targetsCount ?? (Array.isArray(it.targets) ? it.targets.length : 0));
        const tags = Array.isArray(it.tags) ? it.tags.join(", ") : (it.tag ? String(it.tag) : "");
        const started = fmtWhen(it.startedAt);

        const parts = [
            `Status: ${showStatus}`,
            `Started: ${started}`,
            `Targets: ${String(targetsCount ?? 0)}`,
            tags ? `Tags: ${tags}` : "",
            `Findings: ${String(it.totalFindings ?? 0)}`,
            `Errors: ${String(it.totalErrors ?? 0)}`,
            `Verbose: ${it.verbose ? "yes" : "no"}`,
        ].filter(Boolean);

        metaEl.textContent = parts.join(" • ");
    }

    function renderScansList() {
        scans.renderScansList();
        renderActiveScanContext();
    }

    function clearScanUI() {
        if (el("findings")) el("findings").innerHTML = "";
        if (el("requestLogRows")) el("requestLogRows").innerHTML = "";
        renderServersTable();
        renderRunningPanel();
        updateBadges();
        renderRequestLog();
        renderFindingsPager();
        renderFindingsTable();
        renderActiveScanContext();
    }

    function bindFilters(onChange) {
        servers.bindFilters(onChange);
        findings.bindFilters();
    }

    function bindServerRowSelection(onSelectTarget) {
        servers.bindServerRowSelection(onSelectTarget);
    }

    function bindRefreshLogs(onRefresh) {
        requestLog.bindRefreshLogs(onRefresh);
    }

    function bindScansUI({ onRefresh, onSelect, onAction } = {}) {
        scans.bindScansUI({ onRefresh, onSelect, onAction });
    }

    function bindFindingsPager({ onFirst, onPrev, onNext, onReload, onLimit } = {}) {
        findings.bindFindingsPager({ onFirst, onPrev, onNext, onReload, onLimit });
    }

    function bindPanelsPersistUI() {
        bindPanelsPersist();
    }

    return {
        scheduleProbeRender,
        scheduleFindingsRender,

        setConn,
        updateBadges,
        renderRunningPanel,
        renderServersTable,
        renderRequestLog,
        renderScansList,
        clearScanUI,
        renderNetInfo,

        renderFindingsTable,
        renderFindingsPager,

        bindFilters,
        bindServerRowSelection,
        bindRefreshLogs,
        bindScansUI,
        bindFindingsPager,
        bindPanelsPersist: bindPanelsPersistUI,
    };
}
