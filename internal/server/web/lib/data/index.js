import { createScansData } from "./scans.js";
import { createFindingsData } from "./findings.js";
import { createLogsData } from "./logs.js";
import { createNetinfoData } from "./netinfo.js";

export function createData(state, apiFetch) {
    const scans = createScansData(state, apiFetch);
    const findings = createFindingsData(state, apiFetch);
    const logs = createLogsData(state, apiFetch);
    const netinfo = createNetinfoData(state, apiFetch);

    return {
        ...scans,
        ...findings,
        ...logs,
        ...netinfo,
    };
}
