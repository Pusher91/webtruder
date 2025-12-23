export function fmtBytes(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "-";
    if (x < 0) return "-";
    return String(x);
}

export function fmtWhen(s) {
    if (!s) return "-";
    try { return new Date(s).toLocaleString(); } catch { return s; }
}
