export function createState() {
    return {
        servers: new Map(),
        probes: [],
        probeSeen: new Set(),
        maxProbes: 20000,

        scanId: "",
        selectedTarget: "",

        findingsMode: "paged",
        findingsItems: [],

        findingsStreamItems: [],
        findingsStreamMax: 500,
        findingsStreamTotal: 0,

        findingsCursor: 0,
        findingsNextCursor: 0,
        findingsPrevCursors: [],
        findingsLimit: 500,
        findingsHasMore: false,

        // Total findings across the entire scan (not just the current page/buffer).
        // If the API does not provide an exact total, we track a lower bound and expose it as "N+" in the UI.
        findingsTotalAll: null,           // number | null
        findingsTotalLowerBound: false,   // boolean (true => show "N+")

        findingsLastTotal: 0,
        findingsLastShown: 0,

        findingsKnownStatuses: new Set(),

        findingsFilter: {
            statusExcludeSpec: "",
            statusExclude: new Set(),
            statusExcludeBad: [],

            lengthExcludeSpec: "",
            lengthExclude: new Set(),
            lengthExcludeBad: [],
        },

        logCursor: 0,

        verbose: false,
        scans: [],
    };
}
