import { el, escapeHtml } from "./dom.js";
import { fmtBytes } from "./format.js";
import { hostKey } from "./host.js";

export function createRequestLogPanel(state) {
    function renderRequestLog() {
        const tbody = el("requestLogRows");
        if (!tbody) return;

        const cnt = el("requestLogCount");
        if (cnt) cnt.textContent = `${state.probes?.length || 0} total`;

        const hint = el("requestLogHint");
        const mode = state.verbose ? "Verbose" : "Errors only";
        if (hint) {
            hint.textContent = state.selectedTarget
                ? `${mode} - Showing: ${state.selectedTarget} (host match)`
                : `${mode} - Click a server row to filter. (Showing all)`;
        }

        const rows = state.selectedTarget
            ? state.probes.filter((p) => hostKey(p.url || p.target) === hostKey(state.selectedTarget))
            : state.probes;

        const view = rows.slice(0, 500);

        tbody.innerHTML = view.map((p) => `
<tr class="bg-slate-950">
  <td class="p-2 font-mono">${escapeHtml(p.url || `${p.target || ""}${p.path || ""}`)}</td>
  <td class="p-2">${escapeHtml(String(p.status || 0))}</td>
  <td class="p-2">${escapeHtml(fmtBytes(p.length))}</td>
  <td class="p-2">${escapeHtml(String(p.durationMs || 0))}</td>
  <td class="p-2 text-xs ${p.error ? "text-red-400" : "text-slate-500"}">${escapeHtml(p.error || "")}</td>
</tr>
`).join("");
    }

    function bindRefreshLogs(onRefresh) {
        el("refreshLogsBtn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            await onRefresh?.();
        });
    }

    return { renderRequestLog, bindRefreshLogs };
}
