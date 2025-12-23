function probeKey(p) {
    const at = p?.at || "";
    const status = String(p?.status ?? 0);
    const url = p?.url || "";
    const target = p?.target || "";
    const path = p?.path || "";
    return `${at}|${status}|${url || (target + path)}`;
}

export function addProbe(state, p) {
    const key = probeKey(p);
    if (key && state.probeSeen.has(key)) return false;

    if (key) state.probeSeen.add(key);
    state.probes.unshift(p);

    if (state.probes.length > state.maxProbes) {
        state.probes.length = state.maxProbes;
        state.probeSeen = new Set(state.probes.map(probeKey));
    }

    return true;
}

export function ensureServer(state, target) {
    if (!state.servers.has(target)) {
        state.servers.set(target, {
            target,
            status: "queued",
            percent: 0,
            rate: 0,
            checked: 0,
            total: 0,
            findings: 0,
            errors: 0,
            lastProbeAt: 0,
        });
    }
    return state.servers.get(target);
}

export function resetRuntimeState(state) {
    state.servers.clear();
    state.probes = [];
    state.probeSeen = new Set();
    state.selectedTarget = "";
    state.logCursor = 0;

    state.findingsMode = "paged";
    state.findingsItems = [];

    state.findingsStreamItems = [];
    state.findingsStreamTotal = 0;
    state.findingsCursor = 0;
    state.findingsNextCursor = 0;
    state.findingsPrevCursors = [];
    state.findingsHasMore = false;

    state.findingsTotalAll = null;
    state.findingsTotalLowerBound = false;

    state.findingsLastTotal = 0;
    state.findingsLastShown = 0;

    state.findingsKnownStatuses = new Set();

    state.findingsFilter = {
        statusExcludeSpec: "",
        statusExclude: new Set(),
        statusExcludeBad: [],

        lengthExcludeSpec: "",
        lengthExclude: new Set(),
        lengthExcludeBad: [],
    };
}
