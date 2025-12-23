import { el, escapeHtml } from "./dom.js";
import { fmtWhen } from "./format.js";

export function createScansPanel(state) {
    function scanRowHtml(it) {
        const isSelected = state.scanId && state.scanId === it.id;

        const stRaw = String(it.status || "").toLowerCase();
        const active = !!it.active;

        const orphaned = !active && (stRaw === "running" || stRaw === "paused");
        const showStatus = orphaned ? "stopped" : (it.status || "-");

        const tags = Array.isArray(it.tags) ? it.tags.join(", ") : (it.tag ? String(it.tag) : "");
        const targetsCount = (it.targetsCount ?? (Array.isArray(it.targets) ? it.targets.length : 0));

        const canPause = active && stRaw === "running";
        const canResume = active && stRaw === "paused";
        const canStop = active && (stRaw === "running" || stRaw === "paused");
        const canDelete = !active || !(stRaw === "running" || stRaw === "paused");

        const btn = (action, label) => `
<button
type="button"
data-action="${escapeHtml(action)}"
data-scanid="${escapeHtml(it.id)}"
class="px-2 py-1 rounded bg-slate-950 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300"
>${escapeHtml(label)}
</button>
`;

        const actionsHtml = `
<div class="flex items-center gap-2">
${canPause ? btn("pause", "Pause") : ""}
${canResume ? btn("resume", "Resume") : ""}
${canStop ? btn("stop", "Stop") : ""}
${canDelete ? btn("delete", "Delete") : ""}
</div>
`;

        const trClass = [
            "cursor-pointer",
            "transition-colors",
            "hover:bg-slate-800/40",
            isSelected ? "bg-slate-800/30 outline outline-1 outline-slate-700" : "",
        ].filter(Boolean).join(" ");

        return `
<tr class="${trClass}" data-scanid="${escapeHtml(it.id)}">
  <td class="p-3 font-mono">${escapeHtml(it.id)}</td>
  <td class="p-3"><span class="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-300">${escapeHtml(showStatus)}</span></td>
  <td class="p-3 text-slate-300">${escapeHtml(fmtWhen(it.startedAt))}</td>
  <td class="p-3 text-slate-300">${escapeHtml(String(targetsCount))}</td>
  <td class="p-3 text-slate-300">${escapeHtml(tags || "-")}</td>
  <td class="p-3 text-slate-300">${escapeHtml(String(it.totalFindings ?? 0))}</td>
  <td class="p-3 text-slate-300">${escapeHtml(String(it.totalErrors ?? 0))}</td>
  <td class="p-3 text-slate-300">${it.verbose ? "yes" : "no"}</td>
  <td class="p-3">${actionsHtml}</td>
</tr>
`;
    }

    function renderScansList() {
        const tbody = el("scanRows");
        if (!tbody) return;

        tbody.innerHTML = (state.scans || []).map(scanRowHtml).join("");

        const n = state.scans?.length || 0;
        const count = el("scanCount");
        if (count) count.textContent = `${n} total`;

        const hint = el("scansHint");
        if (hint) hint.textContent = state.scanId ? `selected: ${state.scanId}` : (n ? "" : "no scans");
    }

    function bindScansUI({ onRefresh, onSelect, onAction } = {}) {
        el("refreshScansBtn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            await onRefresh?.();
        });

        el("scanRows")?.addEventListener("click", async (e) => {
            const btnEl = e.target.closest("button[data-action][data-scanid]");
            if (btnEl) {
                e.preventDefault();
                const action = btnEl.getAttribute("data-action") || "";
                const id = btnEl.getAttribute("data-scanid") || "";
                if (action && id) await onAction?.(action, id);
                return;
            }

            const tr = e.target.closest("tr[data-scanid]");
            if (!tr) return;
            const id = tr.getAttribute("data-scanid") || "";
            if (!id) return;
            await onSelect?.(id);
        });
    }

    return { renderScansList, bindScansUI };
}
