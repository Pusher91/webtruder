// ./internal/server/web/lib/controllers/findingsAutoSeek.js
export function installFindingsAutoSeek({ state, ui, data }) {
    let timer = null;
    let running = false;

    function el(id) {
        return document.getElementById(id);
    }

    function splitTokens(s) {
        const raw = String(s || "").trim();
        if (!raw) return [];
        // commas OR whitespace
        return raw
            .split(/[\s,]+/g)
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .slice(0, 200);
    }

    function parseIncExc(s, { bangMeansInclude = true } = {}) {
        const inc = [];
        const exc = [];

        const toks = splitTokens(s);
        for (const t0 of toks) {
            const t = String(t0 || "").trim();
            if (!t) continue;

            if (bangMeansInclude && t.startsWith("!")) {
                const x = t.slice(1).trim();
                if (x) inc.push(x);
                continue;
            }

            exc.push(t);
        }

        return { inc, exc };
    }

    function buildFindingsQueryFromDOM() {
        const q = String(el("findingsSearch")?.value || "").trim();

        // New include fields (optional if not present)
        const stIncRaw = String(el("findingsStatusIncludeInput")?.value || "").trim();
        const stExcRaw = String(el("findingsStatusExcludeInput")?.value || "").trim();

        const lenIncRaw = String(el("findingsLengthIncludeInput")?.value || "").trim();
        const lenExcRaw = String(el("findingsLengthExcludeInput")?.value || "").trim();

        // Support legacy "!X" inside exclude fields as include override
        const stIncFromInc = splitTokens(stIncRaw).map((t) => (t.startsWith("!") ? t.slice(1) : t)).filter(Boolean);
        const stParsed = parseIncExc(stExcRaw, { bangMeansInclude: true });

        const lenIncFromInc = splitTokens(lenIncRaw).map((t) => (t.startsWith("!") ? t.slice(1) : t)).filter(Boolean);
        const lenParsed = parseIncExc(lenExcRaw, { bangMeansInclude: true });

        const statusInclude = [...stIncFromInc, ...stParsed.inc].join(",");
        const statusExclude = stParsed.exc.join(",");

        const lengthInclude = [...lenIncFromInc, ...lenParsed.inc].join(",");
        const lengthExclude = lenParsed.exc.join(",");

        return {
            q,
            statusInclude,
            statusExclude,
            lengthInclude,
            lengthExclude,
        };
    }

    async function reloadFirstPage() {
        if (running) return;
        if (!state.scanId) return;
        if (state.findingsMode !== "paged") return;

        running = true;
        try {
            state.findingsQuery = buildFindingsQueryFromDOM();

            const lim = Number(state.findingsLimit || 500);
            await data.loadFindingsFirstPage({ limit: lim });

            ui.renderFindingsTable();
            ui.renderFindingsPager();

            // Optional: if 0 results but hasMore, walk forward a bit
            if ((state.findingsItems || []).length === 0 && state.findingsHasMore) {
                await data.seekFindingsNextMatch({
                    matchFn: (items) => Array.isArray(items) && items.length > 0,
                    maxPages: 10,
                });
                ui.renderFindingsTable();
                ui.renderFindingsPager();
            }
        } finally {
            running = false;
        }
    }

    function scheduleReload() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            reloadFirstPage().catch(() => {});
        }, 200);
    }

    function wire() {
        const ids = [
            "findingsSearch",
            "findingsStatusIncludeInput",
            "findingsStatusExcludeInput",
            "findingsLengthIncludeInput",
            "findingsLengthExcludeInput",
        ];

        for (const id of ids) {
            const x = el(id);
            if (!x) continue;

            x.addEventListener("input", () => scheduleReload());
            x.addEventListener("keydown", (e) => {
                if (e.key === "Enter") scheduleReload();
            });
        }

        const clearBtn = el("findingsClearFiltersBtn");
        if (clearBtn) {
            clearBtn.addEventListener("click", () => {
                const a = el("findingsSearch"); if (a) a.value = "";
                const b = el("findingsStatusIncludeInput"); if (b) b.value = "";
                const c = el("findingsStatusExcludeInput"); if (c) c.value = "";
                const d = el("findingsLengthIncludeInput"); if (d) d.value = "";
                const e = el("findingsLengthExcludeInput"); if (e) e.value = "";
                scheduleReload();
            });
        }

        // Keep compatibility with any existing dispatchers
        document.addEventListener("findings_filter_changed", () => scheduleReload());
    }

    wire();
}
