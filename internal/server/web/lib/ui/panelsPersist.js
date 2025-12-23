function bindDetailsPersist(detailsId, storageKey, defaultOpen = true) {
    const d = document.getElementById(detailsId);
    if (!d) return;

    try {
        const v = localStorage.getItem(storageKey);
        if (v === "0") d.open = false;
        else if (v === "1") d.open = true;
        else d.open = !!defaultOpen;
    } catch {
        d.open = !!defaultOpen;
    }

    d.addEventListener("toggle", () => {
        try { localStorage.setItem(storageKey, d.open ? "1" : "0"); } catch {}
    });
}

export function bindPanelsPersist() {
    bindDetailsPersist("launchDetails", "webtruder.launch.open", true);
    bindDetailsPersist("scansDetails", "webtruder.scans.open", true);
    bindDetailsPersist("serversDetails", "webtruder.servers.open", true);
    bindDetailsPersist("findingsDetails", "webtruder.findings.open", true);
    bindDetailsPersist("requestLogDetails", "webtruder.requestlog.open", true);
}
