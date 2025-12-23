import { el, escapeHtml } from "./dom.js";
import { fmtBytes } from "./format.js";
import { hostKey } from "./host.js";

function normTokens(s) {
    return String(s || "").trim().toLowerCase().split(/\s+/g).filter(Boolean);
}

function statusName(code) {
    const m = new Map([
        [200, "OK"],
        [201, "Created"],
        [204, "No Content"],
        [206, "Partial Content"],
        [301, "Moved Permanently"],
        [302, "Found"],
        [307, "Temporary Redirect"],
        [308, "Permanent Redirect"],
        [400, "Bad Request"],
        [401, "Unauthorized"],
        [403, "Forbidden"],
        [404, "Not Found"],
        [405, "Method Not Allowed"],
        [429, "Too Many Requests"],
        [500, "Internal Server Error"],
        [502, "Bad Gateway"],
        [503, "Service Unavailable"],
    ]);
    return m.get(Number(code)) || "";
}

export function createFindingsPanel(state) {
    let lastEmptyEmitKey = "";
    let pagerControlsEnsured = false;

    function emitFindingsFilterChanged(reason) {
        try {
            document.dispatchEvent(new CustomEvent("findings_filter_changed", {
                detail: { reason: String(reason || "") },
            }));
        } catch {}
    }

    function currentFindingsItems() {
        if (state.findingsMode === "stream") return Array.isArray(state.findingsStreamItems) ? state.findingsStreamItems : [];
        return Array.isArray(state.findingsItems) ? state.findingsItems : [];
    }

    function parseStatusExcludeSpec(raw) {
        const spec = String(raw || "").trim();
        const tokens = spec ? spec.split(/[,\s]+/g).map((x) => x.trim()).filter(Boolean) : [];
        const out = new Set();
        const bad = [];

        const MAX_RANGE_EXPAND = 2000;

        function addRange(a, b) {
            let lo = a, hi = b;
            if (lo > hi) { const t = lo; lo = hi; hi = t; }
            const n = (hi - lo + 1);
            if (n > MAX_RANGE_EXPAND) return false;
            for (let x = lo; x <= hi; x++) out.add(x);
            return true;
        }

        function applyToken(tok) {
            let t = tok;
            let neg = false;

            if (t.startsWith("!")) {
                neg = true;
                t = t.slice(1);
            }

            if (!t) return true;

            if (/^\d{3}$/.test(t)) {
                const n = Number.parseInt(t, 10);
                if (!(n >= 100 && n <= 999)) return false;
                if (neg) out.delete(n); else out.add(n);
                return true;
            }

            if (/^\d{3}-\d{3}$/.test(t)) {
                const [aRaw, bRaw] = t.split("-");
                const a = Number.parseInt(aRaw, 10);
                const b = Number.parseInt(bRaw, 10);
                if (!(a >= 100 && a <= 999 && b >= 100 && b <= 999)) return false;

                if (neg) {
                    let lo = a, hi = b;
                    if (lo > hi) { const z = lo; lo = hi; hi = z; }
                    const n = (hi - lo + 1);
                    if (n > MAX_RANGE_EXPAND) return false;
                    for (let x = lo; x <= hi; x++) out.delete(x);
                    return true;
                }

                return addRange(a, b);
            }

            const m = /^([1-9])xx$/i.exec(t);
            if (m) {
                const h = Number.parseInt(m[1], 10);
                const a = h * 100;
                const b = h * 100 + 99;
                if (!(a >= 100 && b <= 999)) return false;

                if (neg) {
                    for (let x = a; x <= b; x++) out.delete(x);
                    return true;
                }

                return addRange(a, b);
            }

            return false;
        }

        for (const tok of tokens) {
            if (!applyToken(tok)) bad.push(tok);
        }

        return { set: out, bad };
    }

    function parseLengthExcludeSpec(raw) {
        const spec = String(raw || "").trim();
        const tokens = spec ? spec.split(/[,\s]+/g).map((x) => x.trim()).filter(Boolean) : [];
        const out = new Set();
        const bad = [];

        function applyToken(tok) {
            let t = tok;
            let neg = false;

            if (t.startsWith("!")) {
                neg = true;
                t = t.slice(1);
            }

            if (!t) return true;

            if (!/^\d+$/.test(t)) return false;
            const n = Number.parseInt(t, 10);
            if (!Number.isFinite(n) || n < 0) return false;

            if (neg) out.delete(n); else out.add(n);
            return true;
        }

        for (const tok of tokens) {
            if (!applyToken(tok)) bad.push(tok);
        }

        return { set: out, bad };
    }

    function setStatusExcludeErrorText(msg) {
        const e = el("findingsStatusExcludeErr");
        if (!e) return;
        if (!msg) {
            e.textContent = "";
            e.classList.add("hidden");
        } else {
            e.textContent = msg;
            e.classList.remove("hidden");
        }
    }

    function setLengthExcludeErrorText(msg) {
        const e = el("findingsLengthExcludeErr");
        if (!e) return;
        if (!msg) {
            e.textContent = "";
            e.classList.add("hidden");
        } else {
            e.textContent = msg;
            e.classList.remove("hidden");
        }
    }

    function syncStatusExcludeUi() {
        const bad = Array.isArray(state.findingsFilter?.statusExcludeBad) ? state.findingsFilter.statusExcludeBad : [];

        if (bad.length) {
            const shown = bad.slice(0, 8);
            const extra = bad.length > shown.length ? ` (+${bad.length - shown.length} more)` : "";
            setStatusExcludeErrorText(`Invalid token(s): ${shown.join(", ")}${extra}`);
        } else {
            setStatusExcludeErrorText("");
        }
    }

    function syncLengthExcludeUi() {
        const bad = Array.isArray(state.findingsFilter?.lengthExcludeBad) ? state.findingsFilter.lengthExcludeBad : [];

        if (bad.length) {
            const shown = bad.slice(0, 8);
            const extra = bad.length > shown.length ? ` (+${bad.length - shown.length} more)` : "";
            setLengthExcludeErrorText(`Invalid token(s): ${shown.join(", ")}${extra}`);
        } else {
            setLengthExcludeErrorText("");
        }
    }

    function applyStatusExcludeFromInput({ emit = true } = {}) {
        const input = el("findingsStatusExcludeInput");
        const raw = String(input?.value || "");

        if (!state.findingsFilter) state.findingsFilter = {};
        const prev = String(state.findingsFilter.statusExcludeSpec || "");

        if (raw === prev && (state.findingsFilter.statusExclude instanceof Set)) {
            syncStatusExcludeUi();
            return;
        }

        const parsed = parseStatusExcludeSpec(raw);

        state.findingsFilter.statusExcludeSpec = raw;
        state.findingsFilter.statusExclude = parsed.set;
        state.findingsFilter.statusExcludeBad = parsed.bad;

        syncStatusExcludeUi();

        if (emit) emitFindingsFilterChanged("status_exclude");
    }

    function applyLengthExcludeFromInput({ emit = true } = {}) {
        const input = el("findingsLengthExcludeInput");
        const raw = String(input?.value || "");

        if (!state.findingsFilter) state.findingsFilter = {};
        const prev = String(state.findingsFilter.lengthExcludeSpec || "");

        if (raw === prev && (state.findingsFilter.lengthExclude instanceof Set)) {
            syncLengthExcludeUi();
            return;
        }

        const parsed = parseLengthExcludeSpec(raw);

        state.findingsFilter.lengthExcludeSpec = raw;
        state.findingsFilter.lengthExclude = parsed.set;
        state.findingsFilter.lengthExcludeBad = parsed.bad;

        syncLengthExcludeUi();

        if (emit) emitFindingsFilterChanged("length_exclude");
    }

    function readFindingsFilterInputs() {
        const searchTokens = normTokens(el("findingsSearch")?.value || "");

        const excludedStatuses = (state.findingsFilter?.statusExclude instanceof Set) ? state.findingsFilter.statusExclude : new Set();
        const excludedLengths = (state.findingsFilter?.lengthExclude instanceof Set) ? state.findingsFilter.lengthExclude : new Set();

        return { searchTokens, excludedStatuses, excludedLengths };
    }

    function matchFinding(f, flt) {
        const url = String(f.url || `${f.target || ""}${f.path || ""}`);
        const host = hostKey(url);
        const path = String(f.path || "");
        const status = Number(f.status || 0);
        const length = Number(f.length ?? -1);

        if (flt.excludedStatuses.size && flt.excludedStatuses.has(status)) return false;
        if (flt.excludedLengths.size && Number.isFinite(length) && length >= 0 && flt.excludedLengths.has(length)) return false;

        if (flt.searchTokens.length) {
            const hay = (url + " " + host + " " + path).toLowerCase();
            for (const t of flt.searchTokens) if (!hay.includes(t)) return false;
        }

        return true;
    }

    function findingsTotalText() {
        const n = state.findingsTotalAll;
        const hasN = (typeof n === "number") && Number.isFinite(n) && n >= 0;
        if (!hasN) return "";
        return state.findingsTotalLowerBound ? `${n}+` : String(n);
    }

    function clearFindingsFilters() {
        const ids = ["findingsSearch", "findingsStatusExcludeInput", "findingsLengthExcludeInput"];
        for (const id of ids) {
            const x = el(id);
            if (x) x.value = "";
        }

        if (!state.findingsFilter) state.findingsFilter = {};
        state.findingsFilter.statusExcludeSpec = "";
        state.findingsFilter.statusExclude = new Set();
        state.findingsFilter.statusExcludeBad = [];

        state.findingsFilter.lengthExcludeSpec = "";
        state.findingsFilter.lengthExclude = new Set();
        state.findingsFilter.lengthExcludeBad = [];

        syncStatusExcludeUi();
        syncLengthExcludeUi();
        renderFindingsTable();

        emitFindingsFilterChanged("status_exclude");
        emitFindingsFilterChanged("length_exclude");
    }

    function ensureFindingsPagerControls() {
        if (pagerControlsEnsured) return;
        const wrap = el("findingsPager");
        if (!wrap) return;

        wrap.className = "flex items-center gap-2 text-xs flex-wrap";

        wrap.innerHTML = `
<button id="findingsFirstBtn" type="button" class="px-2 py-1 rounded bg-slate-950 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300">First</button>
<button id="findingsPrevBtn" type="button" class="px-2 py-1 rounded bg-slate-950 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300">Prev</button>
<button id="findingsNextBtn" type="button" class="px-2 py-1 rounded bg-slate-950 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300">Next</button>
<button id="findingsReloadBtn" type="button" class="px-2 py-1 rounded bg-slate-950 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300">Reload</button>
<select id="findingsLimitSel" class="p-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-300">
  <option value="200">200</option>
  <option value="500">500</option>
  <option value="1000">1000</option>
  <option value="2000">2000</option>
</select>
<span id="findingsPageText" class="text-slate-400 whitespace-nowrap"></span>
`.trim();

        pagerControlsEnsured = true;
    }

    function renderFindingsTable() {
        const tbody = el("findings");
        if (!tbody) return;

        applyStatusExcludeFromInput({ emit: false });
        applyLengthExcludeFromInput({ emit: false });

        const items = currentFindingsItems();
        const flt = readFindingsFilterInputs();

        for (const f of items) {
            const st = Number(f.status || 0);
            if (Number.isFinite(st) && st > 0) state.findingsKnownStatuses.add(st);
        }


        const filtered = items.filter((f) => matchFinding(f, flt));

        if (!filtered.length) {
            tbody.innerHTML = `
<tr class="bg-slate-950">
  <td class="p-3 text-slate-400" colspan="3">No findings match the current filters.</td>
</tr>
`.trim();
        } else {
            tbody.innerHTML = filtered.map((f) => {
                const url = f.url || `${f.target || ""}${f.path || ""}`;
                const status = Number(f.status || 0);
                const length = Number(f.length ?? -1);
                return `
<tr class="bg-slate-950">
  <td class="p-2 font-mono">${escapeHtml(url)}</td>
  <td class="p-2">${escapeHtml(String(status))}</td>
  <td class="p-2">${escapeHtml(fmtBytes(length))}</td>
</tr>
`.trim();
            }).join("");
        }

        const pageTotal = items.length;
        const shown = filtered.length;

        const totalText = findingsTotalText();
        const cnt = el("findingsCount");
        if (cnt) cnt.textContent = `${totalText || String(pageTotal)} total`;

        state.findingsLastTotal = pageTotal;
        state.findingsLastShown = shown;

        const emptyKey = [
            String(state.findingsCursor ?? 0),
            String(state.findingsFilter?.statusExcludeSpec || ""),
            String(state.findingsFilter?.lengthExcludeSpec || ""),
            String(el("findingsSearch")?.value || ""),
        ].join("|");

        if (state.findingsMode === "paged" && shown === 0 && state.findingsHasMore) {
            if (emptyKey !== lastEmptyEmitKey) {
                lastEmptyEmitKey = emptyKey;
                emitFindingsFilterChanged("page_empty");
            }
        } else {
            lastEmptyEmitKey = "";
        }
    }

    function renderFindingsPager() {
        ensureFindingsPagerControls();

        const firstBtn = el("findingsFirstBtn");
        const prevBtn = el("findingsPrevBtn");
        const nextBtn = el("findingsNextBtn");
        const reloadBtn = el("findingsReloadBtn");
        const limSel = el("findingsLimitSel");
        const txt = el("findingsPageText");

        if (!limSel || !txt) return;

        const lim = Number(state.findingsLimit || 500);
        limSel.value = ["200", "500", "1000", "2000"].includes(String(lim)) ? String(lim) : "500";

        if (state.findingsMode === "stream") {
            if (firstBtn) firstBtn.disabled = true;
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            if (reloadBtn) reloadBtn.disabled = true;
            limSel.disabled = true;
            txt.textContent = `Live (latest ${state.findingsStreamMax || 500})`;
            return;
        }

        const hasPrev = Array.isArray(state.findingsPrevCursors) && state.findingsPrevCursors.length > 0;
        const hasMore = !!state.findingsHasMore;
        const pageNum = (state.findingsPrevCursors?.length || 0) + 1;
        const count = Array.isArray(state.findingsItems) ? state.findingsItems.length : 0;

        if (firstBtn) firstBtn.disabled = !hasPrev;
        if (prevBtn) prevBtn.disabled = !hasPrev;
        if (nextBtn) nextBtn.disabled = !hasMore;
        if (reloadBtn) reloadBtn.disabled = !state.scanId;
        limSel.disabled = !state.scanId;

        txt.textContent = `Page ${pageNum} | ${count} items`;
    }

    function bindFilters() {
        let tSearch = null;
        el("findingsSearch")?.addEventListener("input", () => {
            renderFindingsTable();
            if (tSearch) clearTimeout(tSearch);
            tSearch = setTimeout(() => {
                tSearch = null;
                emitFindingsFilterChanged("search");
            }, 150);
        });


        el("findingsClearFiltersBtn")?.addEventListener("click", (e) => {
            e.preventDefault();
            clearFindingsFilters();
        });

        let tStatus = null;
        el("findingsStatusExcludeInput")?.addEventListener("input", () => {
            if (tStatus) clearTimeout(tStatus);
            tStatus = setTimeout(() => {
                tStatus = null;
                applyStatusExcludeFromInput({ emit: true });
                renderFindingsTable();
            }, 125);
        });

        let tLen = null;
        el("findingsLengthExcludeInput")?.addEventListener("input", () => {
            if (tLen) clearTimeout(tLen);
            tLen = setTimeout(() => {
                tLen = null;
                applyLengthExcludeFromInput({ emit: true });
                renderFindingsTable();
            }, 125);
        });

        // el("findingsExcludedStatuses")?.addEventListener("click", (e) => {
        //     const btn = e.target.closest("button[data-remove-status]");
        //     if (!btn) return;
        //     e.preventDefault();
        //
        //     const st = Number.parseInt(btn.getAttribute("data-remove-status") || "", 10);
        //     if (!Number.isFinite(st)) return;
        //
        //     const input = el("findingsStatusExcludeInput");
        //     if (!input) {
        //         if (state.findingsFilter?.statusExclude instanceof Set) state.findingsFilter.statusExclude.delete(st);
        //         renderFindingsTable();
        //         emitFindingsFilterChanged("status_exclude");
        //         return;
        //     }
        //
        //     const cur = String(input.value || "").trim();
        //     const neg = `!${st}`;
        //     const next = cur ? `${cur} ${neg}` : neg;
        //     input.value = next;
        //
        //     applyStatusExcludeFromInput({ emit: true });
        //     renderFindingsTable();
        // });

        // el("findingsExcludedLengths")?.addEventListener("click", (e) => {
        //     const btn = e.target.closest("button[data-remove-length]");
        //     if (!btn) return;
        //     e.preventDefault();
        //
        //     const n = Number.parseInt(btn.getAttribute("data-remove-length") || "", 10);
        //     if (!Number.isFinite(n) || n < 0) return;
        //
        //     const input = el("findingsLengthExcludeInput");
        //     if (!input) {
        //         if (state.findingsFilter?.lengthExclude instanceof Set) state.findingsFilter.lengthExclude.delete(n);
        //         renderFindingsTable();
        //         emitFindingsFilterChanged("length_exclude");
        //         return;
        //     }
        //
        //     const cur = String(input.value || "").trim();
        //     const neg = `!${n}`;
        //     const next = cur ? `${cur} ${neg}` : neg;
        //     input.value = next;
        //
        //     applyLengthExcludeFromInput({ emit: true });
        //     renderFindingsTable();
        // });

        ensureFindingsPagerControls();

        applyStatusExcludeFromInput({ emit: false });
        applyLengthExcludeFromInput({ emit: false });
        renderFindingsTable();
    }

    function bindFindingsPager({ onFirst, onPrev, onNext, onReload, onLimit } = {}) {
        ensureFindingsPagerControls();

        el("findingsFirstBtn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            await onFirst?.();
        });
        el("findingsPrevBtn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            await onPrev?.();
        });
        el("findingsNextBtn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            await onNext?.();
        });
        el("findingsReloadBtn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            await onReload?.();
        });
        el("findingsLimitSel")?.addEventListener("change", async (e) => {
            const v = Number.parseInt(e.target?.value || "500", 10);
            if (Number.isFinite(v) && v > 0) await onLimit?.(v);
        });
    }

    return {
        renderFindingsTable,
        renderFindingsPager,
        bindFilters,
        bindFindingsPager,
    };
}
