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

    function setError(id, msg) {
        const x = el(id);
        if (!x) return;
        const text = String(msg || "").trim();
        x.textContent = text;
        if (text) x.classList.remove("hidden");
        else x.classList.add("hidden");
    }

    function setActiveHint(msg, { isError = false } = {}) {
        const x = el("findingsActiveHint");
        if (!x) return;
        const text = String(msg || "").trim();
        x.textContent = text;
        x.classList.remove("text-slate-400", "text-red-400");
        x.classList.add(isError ? "text-red-400" : "text-slate-400");
    }

    function isValidStatusToken(tok) {
        const t = String(tok || "").trim().toLowerCase();
        if (!t) return false;

        if (/^\d{3}$/.test(t)) {
            const n = Number.parseInt(t, 10);
            return n >= 100 && n <= 599;
        }
        if (/^[1-5]xx$/.test(t)) return true;

        if (/^\d{3}-\d{3}$/.test(t)) {
            const [aRaw, bRaw] = t.split("-");
            const a = Number.parseInt(aRaw, 10);
            const b = Number.parseInt(bRaw, 10);
            return a >= 100 && a <= 599 && b >= 100 && b <= 599 && a <= b;
        }

        return false;
    }

    function isValidLengthToken(tok) {
        const t = String(tok || "").trim().toLowerCase();
        if (!t) return false;

        if (/^\d+$/.test(t)) return true;

        if (/^\d+-\d+$/.test(t)) {
            const [aRaw, bRaw] = t.split("-");
            const a = Number.parseInt(aRaw, 10);
            const b = Number.parseInt(bRaw, 10);
            return a >= 0 && b >= 0 && a <= b;
        }

        return false;
    }

    function invalidTokens(tokens, validateFn) {
        const bad = [];
        for (const tok of (tokens || [])) {
            if (!validateFn(tok)) bad.push(tok);
        }
        return bad;
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

        const statusIncludeToks = [...stIncFromInc, ...stParsed.inc];
        const statusExcludeToks = stParsed.exc;

        const lengthIncludeToks = [...lenIncFromInc, ...lenParsed.inc];
        const lengthExcludeToks = lenParsed.exc;

        const badStatusInc = invalidTokens(statusIncludeToks, isValidStatusToken);
        const badLengthInc = invalidTokens(lengthIncludeToks, isValidLengthToken);
        const badStatusExc = invalidTokens(statusExcludeToks, isValidStatusToken);
        const badLengthExc = invalidTokens(lengthExcludeToks, isValidLengthToken);

        setError("findingsStatusIncludeErr", badStatusInc.length ? `Invalid token(s): ${badStatusInc.slice(0, 8).join(", ")}` : "");
        setError("findingsLengthIncludeErr", badLengthInc.length ? `Invalid token(s): ${badLengthInc.slice(0, 8).join(", ")}` : "");

        if (badStatusInc.length || badLengthInc.length || badStatusExc.length || badLengthExc.length) {
            setActiveHint("Fix invalid filter tokens before reloading findings.", { isError: true });
            return null;
        }

        setActiveHint("", { isError: false });

        const statusInclude = statusIncludeToks.join(",");
        const statusExclude = statusExcludeToks.join(",");
        const lengthInclude = lengthIncludeToks.join(",");
        const lengthExclude = lengthExcludeToks.join(",");

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
            const query = buildFindingsQueryFromDOM();
            if (!query) return;
            state.findingsQuery = query;

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
            reloadFirstPage().catch((err) => {
                const msg = String(err?.message || "").trim() || "Failed to refresh findings.";
                setActiveHint(msg, { isError: true });
            });
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
