import { el, escapeHtml } from "./dom.js";
import { hostKey } from "./host.js";

function parseIPv4(host) {
    const s = String(host || "").trim();
    const m = /^(\d{1,3})(?:\.(\d{1,3})){3}$/.exec(s);
    if (!m) return null;

    const parts = s.split(".").map((x) => Number.parseInt(x, 10));
    if (parts.length !== 4) return null;
    for (const p of parts) {
        if (!Number.isFinite(p) || p < 0 || p > 255) return null;
    }
    return parts;
}

function compareTargets(aTarget, bTarget) {
    const aHost = hostKey(aTarget);
    const bHost = hostKey(bTarget);

    const aIP = parseIPv4(aHost);
    const bIP = parseIPv4(bHost);

    if (aIP && bIP) {
        for (let i = 0; i < 4; i++) {
            if (aIP[i] !== bIP[i]) return aIP[i] - bIP[i];
        }
        return 0;
    }
    if (aIP && !bIP) return -1;
    if (!aIP && bIP) return 1;

    const c = aHost.localeCompare(bHost, undefined, { numeric: true, sensitivity: "base" });
    if (c !== 0) return c;

    return String(aTarget || "").localeCompare(String(bTarget || ""), undefined, { numeric: true, sensitivity: "base" });
}

export function createServersPanel(state) {
    function updateBadges() {
        let running = 0, queued = 0, paused = 0, done = 0;

        for (const s of state.servers.values()) {
            if (s.status === "running") running++;
            else if (s.status === "queued") queued++;
            else if (s.status === "paused") paused++;
            else if (s.status === "completed") done++;
        }

        if (el("badgeRunning")) el("badgeRunning").textContent = `Running: ${running}`;
        if (el("badgeQueued")) el("badgeQueued").textContent = `Queued: ${queued}`;
        if (el("badgePaused")) el("badgePaused").textContent = `Paused: ${paused}`;
        if (el("badgeDone")) el("badgeDone").textContent = `Done: ${done}`;
    }

    function renderRunningPanel() {
        const running = Array.from(state.servers.values()).filter(
            (s) => s.status === "running" || s.status === "completed"
        );

        const totalChecked = running.reduce((a, s) => a + (s.checked || 0), 0);
        const totalTotal = running.reduce((a, s) => a + (s.total || 0), 0);
        const sumRps = running.reduce((a, s) => a + (s.rate || 0), 0);

        const pct = totalTotal > 0 ? Math.round((totalChecked * 100) / totalTotal) : 0;

        if (el("runningOverallBar")) el("runningOverallBar").style.width = `${pct}%`;
        if (el("runningOverallText")) el("runningOverallText").textContent = `${pct}%`;
        if (el("runningMeta")) el("runningMeta").textContent = `${totalChecked}/${totalTotal} requests - ${sumRps} req/s`;
    }

    function serverRowHtml(s) {
        const status = s.status || "queued";
        const pct = s.percent || 0;

        const isSelected = state.selectedTarget && state.selectedTarget === s.target;
        const trClass = [
            "cursor-pointer",
            "transition-colors",
            "hover:bg-slate-800/40",
            isSelected ? "bg-slate-800/30 outline outline-1 outline-slate-700" : "",
        ].filter(Boolean).join(" ");

        return `
<tr class="${trClass}" data-target="${encodeURIComponent(s.target)}">
  <td class="p-3 font-mono">${escapeHtml(s.target)}</td>
  <td class="p-3">
    <span class="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-300">${escapeHtml(status)}</span>
  </td>
  <td class="p-3">
    <div class="w-40 bg-slate-800 rounded h-2">
      <div class="bg-indigo-500 h-2 rounded" style="width:${pct}%"></div>
    </div>
    <div class="text-xs text-slate-500 mt-1">${pct}%</div>
  </td>
  <td class="p-3 text-slate-300">${escapeHtml(String(s.checked || 0))}/${escapeHtml(String(s.total || 0))}</td>
  <td class="p-3 text-slate-300">${escapeHtml(String(s.findings || 0))}</td>
  <td class="p-3 text-slate-300">${escapeHtml(String(s.errors || 0))}</td>
  <td class="p-3 text-slate-300">${escapeHtml(String(s.rate || 0))}</td>
  <td class="p-3 text-slate-400 text-xs">-</td>
</tr>
`;
    }

    function renderServersTable() {
        const tbody = el("serverRows");
        if (!tbody) return;

        const filter = (el("serverFilter")?.value || "").trim().toLowerCase();
        const statusFilter = (el("statusFilter")?.value || "all").trim();
        const sortBy = (el("sortBy")?.value || "host").trim();

        let rows = Array.from(state.servers.values());

        if (filter) rows = rows.filter((s) => s.target.toLowerCase().includes(filter));

        if (statusFilter !== "all") {
            if (statusFilter === "error") rows = rows.filter((s) => (Number(s.errors || 0) > 0));
            else rows = rows.filter((s) => (s.status || "queued") === statusFilter);
        }

        rows.sort((a, b) => {
            if (sortBy === "progress") return (b.percent || 0) - (a.percent || 0);
            if (sortBy === "status") return String(a.status || "").localeCompare(String(b.status || ""));
            if (sortBy === "findings") return (b.findings || 0) - (a.findings || 0);
            if (sortBy === "recent") return (b.lastProbeAt || 0) - (a.lastProbeAt || 0);
            return compareTargets(a.target, b.target);
        });

        tbody.innerHTML = rows.map(serverRowHtml).join("");

        if (el("serverCount")) el("serverCount").textContent = `${state.servers.size} total`;
    }

    function bindFilters(onChange) {
        el("serverFilter")?.addEventListener("input", onChange);
        el("statusFilter")?.addEventListener("change", onChange);
        el("sortBy")?.addEventListener("change", onChange);
    }

    function bindServerRowSelection(onSelectTarget) {
        el("serverRows")?.addEventListener("click", (e) => {
            const tr = e.target.closest("tr[data-target]");
            if (!tr) return;
            const target = decodeURIComponent(tr.getAttribute("data-target") || "");
            onSelectTarget?.(target);
        });
    }

    return {
        updateBadges,
        renderRunningPanel,
        renderServersTable,
        bindFilters,
        bindServerRowSelection,
    };
}
