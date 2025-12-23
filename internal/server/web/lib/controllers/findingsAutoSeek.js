export function installFindingsAutoSeek({ state, ui, data }) {
    let timer = null;
    let running = false;

    async function run() {
        if (running) return;
        if (!state.scanId) return;
        if (state.findingsMode !== "paged") return;
        if ((state.findingsLastShown ?? 0) > 0) return;
        if (!state.findingsHasMore) return;

        running = true;
        try {
            await data.loadFindingsFirstPage({ limit: state.findingsLimit });
            ui.renderFindingsTable();
            ui.renderFindingsPager();

            if ((state.findingsLastShown ?? 0) > 0) return;

            const lim = Number(state.findingsLimit || 500);
            const maxItemsToScan = 20000;
            const maxPages = Math.max(1, Math.ceil(maxItemsToScan / Math.max(1, lim)));

            let pages = 0;
            while ((state.findingsLastShown ?? 0) === 0 && state.findingsHasMore && pages < maxPages) {
                pages++;
                await data.loadFindingsNextPage();
                ui.renderFindingsTable();
                ui.renderFindingsPager();
            }
        } finally {
            running = false;
        }
    }

    document.addEventListener("findings_filter_changed", (e) => {
        const reason = e?.detail?.reason || "";
        if (reason !== "status_exclude" && reason !== "length_exclude") return;

        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            run().catch(() => {});
        }, 150);
    });
}
