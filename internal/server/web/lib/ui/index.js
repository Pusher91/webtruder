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

    let scansRenderTimer = null;
    let scansRenderDeferredUntil = 0;
    function deferScansRender(ms = 350) {
        const until = Date.now() + Math.max(0, Number(ms) || 0);
        if (until > scansRenderDeferredUntil) scansRenderDeferredUntil = until;
    }

    function scheduleScansRender(delayMs = 120) {
        if (scansRenderTimer) return;
        scansRenderTimer = setTimeout(() => {
            scansRenderTimer = null;
            const now = Date.now();
            if (now < scansRenderDeferredUntil) {
                scheduleScansRender(Math.max(30, scansRenderDeferredUntil - now + 20));
                return;
            }
            renderScansList();
        }, Math.max(0, Number(delayMs) || 0));
    }

    function setConn(text) {
        const c = el("conn");
        if (c) c.textContent = text;
    }

    let helpTipEl = null;
    let helpTipTimer = null;
    function hideHelpTip() {
        if (helpTipTimer) {
            clearTimeout(helpTipTimer);
            helpTipTimer = null;
        }
        if (helpTipEl && helpTipEl.parentNode) {
            helpTipEl.parentNode.removeChild(helpTipEl);
        }
        helpTipEl = null;
    }

    function showHelpTip(targetEl, msg) {
        if (!targetEl || !msg) return;
        if (!helpTipEl) {
            helpTipEl = document.createElement("div");
            helpTipEl.className = "fixed z-50 max-w-xs rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 shadow-lg";
            helpTipEl.style.pointerEvents = "none";
            document.body.appendChild(helpTipEl);
        }
        helpTipEl.textContent = String(msg);

        const r = targetEl.getBoundingClientRect();
        const top = (r.top > 60) ? (r.top - 34) : (r.bottom + 8);
        const left = Math.min(
            Math.max(8, r.left - 8),
            Math.max(8, window.innerWidth - 320)
        );

        helpTipEl.style.top = `${Math.round(top)}px`;
        helpTipEl.style.left = `${Math.round(left)}px`;

        if (helpTipTimer) clearTimeout(helpTipTimer);
        helpTipTimer = setTimeout(() => hideHelpTip(), 3500);
    }

    function bindHelpTooltips() {
        document.addEventListener("click", (e) => {
            const raw = e.target;
            const base = (raw && raw.nodeType === 3) ? raw.parentElement : raw;
            const t = base?.closest?.(".cursor-help[title]");
            if (!t) return;
            const msg = String(t.getAttribute("title") || "").trim();
            if (!msg) return;
            e.preventDefault();
            e.stopPropagation();
            showHelpTip(t, msg);
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") hideHelpTip();
        });
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
        const progressPctRaw = Number.parseInt(String(it.progressPct ?? it.progressPercent ?? 0), 10);
        const progressPct = Number.isFinite(progressPctRaw) ? Math.max(0, Math.min(100, progressPctRaw)) : 0;
        const tags = Array.isArray(it.tags) ? it.tags.join(", ") : (it.tag ? String(it.tag) : "");
        const started = fmtWhen(it.startedAt);

        const parts = [
            `Status: ${showStatus}`,
            `Started: ${started}`,
            `Targets: ${String(targetsCount ?? 0)}`,
            `Progress: ${String(progressPct)}%`,
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

    function bindScansUI({ onRefresh, onSelect, onAction, onInteract } = {}) {
        scans.bindScansUI({
            onRefresh,
            onSelect,
            onAction,
            onInteract: () => {
                deferScansRender(350);
                onInteract?.();
            },
        });
    }

    function bindFindingsPager({ onFirst, onPrev, onNext, onReload, onLimit } = {}) {
        findings.bindFindingsPager({ onFirst, onPrev, onNext, onReload, onLimit });
    }

    function bindPanelsPersistUI() {
        bindPanelsPersist();
    }

    bindHelpTooltips();

    return {
        scheduleProbeRender,
        scheduleFindingsRender,
        scheduleScansRender,
        deferScansRender,

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
