export async function apiFetch(url, { method = "GET", headers = {}, body } = {}) {
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;

    const resp = await fetch(url, {
        method,
        headers: isForm ? { ...headers } : { "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
    });

    const ct = resp.headers.get("content-type") || "";
    let data = null;
    let text = "";

    if (ct.includes("application/json")) {
        try { data = await resp.json(); } catch {}
    } else {
        text = await resp.text();
        if (text) { try { data = JSON.parse(text); } catch {} }
    }

    const apiErr = data && data.ok === false && data.error ? data.error : null;

    if (!resp.ok || apiErr) {
        const err = new Error((apiErr && apiErr.message) || (data && data.message) || text || `request failed (${resp.status})`);
        err.status = resp.status;
        err.code = apiErr && apiErr.code;
        err.details = (apiErr && apiErr.details) || (data && data.details) || null;
        err.raw = data || text || null;
        throw err;
    }

    return data;
}
