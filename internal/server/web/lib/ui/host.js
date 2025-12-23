function stripWWW(host) {
    const h = String(host || "").toLowerCase();
    return h.startsWith("www.") ? h.slice(4) : h;
}

export function hostKey(s) {
    const str = String(s || "").trim();
    if (!str) return "";
    try { return stripWWW(new URL(str).hostname); } catch {}
    try { return stripWWW(new URL("http://" + str).hostname); } catch {}
    return stripWWW(str.split("/")[0]);
}
