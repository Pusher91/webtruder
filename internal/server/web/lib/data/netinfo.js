export function createNetinfoData(state, apiFetch) {
    async function refreshNetInfo({ publicIP = false } = {}) {
        const url = publicIP ? "/api/netinfo?public=1" : "/api/netinfo";
        const resp = await apiFetch(url);
        const d = resp?.data ?? resp ?? null;
        return d || null;
    }

    return { refreshNetInfo };
}
