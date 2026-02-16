import { bindLaunchForm } from "./forms/launch.js";

import { apiFetch } from "./api.js";
import { createState } from "./state/state.js";
import { resetRuntimeState } from "./state/mutations.js";

import { createUI } from "./ui/index.js";
import { createData } from "./data/index.js";
import { startSSE } from "./sse/sse.js";

import { installFindingsAutoSeek } from "./controllers/findingsAutoSeek.js";

const state = createState();
const ui = createUI(state);
const data = createData(state, apiFetch);

function reportNonFatal(context, err) {
    console.error(err);
    const msg = String(err?.message || "").trim() || "request failed";
    ui.setConn(`error: ${context} (${msg})`);
}

async function refreshNetInfo() {
    try {
        const info = await data.refreshNetInfo();
        ui.renderNetInfo(info);
    } catch {
        ui.renderNetInfo(null);
    }
}

async function loadFindingsFirstPageAndRender() {
    await data.loadFindingsFirstPage({ limit: state.findingsLimit });
    ui.renderFindingsTable();
    ui.renderFindingsPager();
}

function updateLogTailForScan(scanId) {
    const it = (state.scans || []).find((x) => x.id === scanId);
    const isActive = !!(it && it.active && (String(it.status).toLowerCase() === "running" || String(it.status).toLowerCase() === "paused"));
    if (isActive) data.startLogTail(() => ui.scheduleProbeRender(), (err) => reportNonFatal("log tail", err));
    else data.stopLogTail();
}

async function selectScan(scanId) {
    try {
        document.dispatchEvent(new CustomEvent("scan_selected", { detail: { scanId } }));
    } catch {}

    data.stopLogTail();
    ui.clearScanUI();

    await data.loadScanState(scanId);

    ui.setConn("connected");
    ui.renderServersTable();
    ui.renderRunningPanel();
    ui.updateBadges();
    ui.renderScansList();

    await loadFindingsFirstPageAndRender();

    await data.loadLogsUntilFull({ maxItems: 2000 });
    ui.renderRequestLog();
    ui.renderRunningPanel();

    updateLogTailForScan(scanId);

    const it = (state.scans || []).find((x) => x.id === scanId);
    const isRunning = it && String(it.status).toLowerCase() === "running";
    if (isRunning) ui.scheduleProbeRender();
}

bindLaunchForm();

ui.bindFilters(() => {
    ui.renderServersTable();
    ui.renderRunningPanel();
    ui.updateBadges();
    ui.renderScansList();
    ui.renderFindingsPager();
});

ui.bindFindingsPager({
    onFirst: async () => {
        state.findingsMode = "paged";
        await data.loadFindingsFirstPage({ limit: state.findingsLimit });
        ui.renderFindingsTable();
        ui.renderFindingsPager();
    },
    onPrev: async () => {
        state.findingsMode = "paged";
        await data.loadFindingsPrevPage();
        ui.renderFindingsTable();
        ui.renderFindingsPager();
    },
    onNext: async () => {
        state.findingsMode = "paged";
        await data.loadFindingsNextPage();
        ui.renderFindingsTable();
        ui.renderFindingsPager();
    },
    onReload: async () => {
        state.findingsMode = "paged";
        await data.reloadFindingsPage();
        ui.renderFindingsTable();
        ui.renderFindingsPager();
    },
    onLimit: async (limit) => {
        state.findingsMode = "paged";
        state.findingsLimit = limit;
        await data.loadFindingsFirstPage({ limit });
        ui.renderFindingsTable();
        ui.renderFindingsPager();
    },
});

ui.bindServerRowSelection(async (target) => {
    state.selectedTarget = target;
    ui.renderServersTable();
    ui.renderRequestLog();
    try {
        await data.refreshLogs();
        ui.renderRequestLog();
    } catch (err) {
        reportNonFatal("refresh logs", err);
    }
});

ui.bindRefreshLogs(async () => {
    try {
        await data.refreshLogs();
        ui.scheduleProbeRender();
    } catch (err) {
        reportNonFatal("refresh logs", err);
    }
});

ui.bindScansUI({
    onRefresh: async () => {
        try {
            await data.refreshScansList();
            ui.renderScansList();
            if (state.scanId) updateLogTailForScan(state.scanId);
        } catch (err) {
            reportNonFatal("refresh scans", err);
        }
    },
    onSelect: async (scanId) => {
        try {
            await selectScan(scanId);
            ui.renderScansList();
        } catch (err) {
            reportNonFatal("select scan", err);
        }
    },
    onAction: async (action, scanId) => {
        try {
            if (action === "stop") {
                if (!confirm(`Stop scan ${scanId}?`)) return;
                await data.stopScan(scanId);
            } else if (action === "pause") {
                await data.pauseScan(scanId);
            } else if (action === "resume") {
                await data.resumeScan(scanId);
            } else if (action === "delete") {
                if (!confirm(`Delete scan ${scanId}? This will permanently remove its data.`)) return;
                await data.deleteScan(scanId);
            } else {
                return;
            }

            const items = await data.refreshScansList();
            ui.renderScansList();

            if (action === "delete" && state.scanId === scanId) {
                const def = data.pickDefaultScanId(items);
                if (def) {
                    await selectScan(def);
                    ui.renderScansList();
                } else {
                    data.stopLogTail();
                    resetRuntimeState(state);
                    state.scanId = "";
                    ui.clearScanUI();
                    ui.renderScansList();
                }
                return;
            }

            if (state.scanId === scanId) {
                await data.loadScanState(scanId);
                ui.renderServersTable();
                ui.renderRunningPanel();
                ui.updateBadges();
                ui.renderRequestLog();
                await loadFindingsFirstPageAndRender();
                updateLogTailForScan(scanId);
            }
        } catch (err) {
            console.error(err);
            ui.setConn(`error: ${err?.message || "request failed"}`);
        }
    },
});

ui.bindPanelsPersist();
installFindingsAutoSeek({ state, ui, data });

startSSE({
    state,
    ui,
    data,
    onScanDone: async () => {
        try {
            await data.refreshScansList();
            ui.renderScansList();

            state.findingsMode = "paged";
            await data.loadFindingsFirstPage({ limit: state.findingsLimit });
            ui.renderFindingsTable();
            ui.renderFindingsPager();

            if (state.scanId) updateLogTailForScan(state.scanId);
        } catch (err) {
            reportNonFatal("scan completion refresh", err);
        }
    },
});

refreshNetInfo();
setInterval(() => refreshNetInfo(), 30000);

(async () => {
    try {
        const items = await data.refreshScansList();
        ui.renderScansList();

        const def = data.pickDefaultScanId(items);
        if (def) await selectScan(def);
    } catch (err) {
        reportNonFatal("initial load", err);
    }
})();
