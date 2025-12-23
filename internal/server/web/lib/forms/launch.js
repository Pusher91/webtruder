import { apiFetch } from "../api.js";

const PROXY_KEY = "webtruder.proxy";
const el = (id) => document.getElementById(id);

function unwrap(resp) {
    return resp?.data ?? resp ?? {};
}

function escAttr(s) {
    return String(s).replace(/["\\]/g, "\\$&");
}

function titleCaseMessage(s) {
    if (!s) return s;
    if (s === "required") return "Required";
    if (s.startsWith("must be ")) return "Must be " + s.slice("must be ".length);
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function clearFormErrors(formEl) {
    formEl.querySelectorAll("[data-field]").forEach((wrap) => {
        const err = wrap.querySelector(".field-error");
        const input = wrap.querySelector("input, textarea, select");
        if (input) input.classList.remove("border-red-500", "ring-1", "ring-red-500");
        if (err) {
            err.textContent = "";
            err.classList.add("hidden");
        }
    });
}

function applyFormErrors(formEl, details) {
    if (!details || typeof details !== "object") return;
    for (const [field, msg] of Object.entries(details)) {
        const wrap = formEl.querySelector(`[data-field="${escAttr(field)}"]`);
        if (!wrap) continue;

        const err = wrap.querySelector(".field-error");
        const input = wrap.querySelector("input, textarea, select");
        if (input) input.classList.add("border-red-500", "ring-1", "ring-red-500");
        if (err) {
            err.textContent = titleCaseMessage(String(msg));
            err.classList.remove("hidden");
        }
    }
}

function setWordlistStatus(text, isError = false) {
    const out = el("wordlistPicked");
    if (!out) return;
    out.className = isError ? "text-xs text-red-400" : "text-xs text-slate-500";
    out.textContent = text;
}

async function uploadWordlistOnce(file) {
    const fd = new FormData();
    fd.append("file", file, file.name);

    const d = unwrap(await apiFetch("/api/wordlists/upload", { method: "POST", body: fd }));
    const id = d.wordlistId || d.id;
    if (!id) throw new Error("upload failed (missing wordlistId)");
    return id;
}

async function sha256Hex(file) {
    const buf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureWordlistId() {
    const hidden = el("wordlistId");
    const input = el("wordlistFile");
    if (!hidden || !input) return "";

    if (hidden.value) return hidden.value;

    const file = input.files && input.files[0];
    if (!file) return "";

    setWordlistStatus(`Hashing ${file.name}...`);
    const hash = await sha256Hex(file);

    const ex = unwrap(await apiFetch(`/api/wordlists/exists?id=${encodeURIComponent(hash)}`));
    if (ex.exists) {
        hidden.value = hash;
        setWordlistStatus(`Selected: ${file.name} (already uploaded)`);
        return hash;
    }

    setWordlistStatus(`Uploading ${file.name}...`);
    const id = await uploadWordlistOnce(file);
    hidden.value = id;
    setWordlistStatus(`Selected: ${file.name}`);
    return id;
}

async function startScan() {
    const launchForm = el("launchForm");
    const launchMsg = el("launchMsg");
    if (!launchForm || !launchMsg) return;

    clearFormErrors(launchForm);

    try {
        const targets = el("targets").value.split("\n").map((x) => x.trim()).filter(Boolean);
        const concurrency = Number.parseInt(el("concurrency").value, 10);
        const timeoutMs = Number.parseInt(el("timeoutMs").value, 10);

        let rateLimit = Number.parseInt(el("rateLimit")?.value ?? "", 10);
        if (!Number.isFinite(rateLimit) || rateLimit < 0) rateLimit = 0;

        const rawTags = (el("scanTag").value || "").trim();
        const tags = rawTags.split(/[,\n]+/g).map((t) => t.trim()).filter(Boolean);

        const wordlistId = await ensureWordlistId();

        launchMsg.className = "text-xs text-slate-400";
        launchMsg.textContent = "";

        const verbose = !!el("verbose")?.checked;
        const proxy = (el("proxy")?.value || "").trim();

        await apiFetch("/api/scan/start", {
            method: "POST",
            body: { targets, wordlistId, concurrency, timeoutMs, rateLimit, tags, verbose, proxy },
        });

        launchMsg.className = "text-xs text-emerald-400";
        launchMsg.textContent = "scan started";
    } catch (err) {
        if (err?.code === "validation_error") {
            applyFormErrors(launchForm, err.details);
            launchMsg.className = "text-xs text-red-400";
            launchMsg.textContent = "Invalid request";
            return;
        }
        launchMsg.className = "text-xs text-red-400";
        launchMsg.textContent = err?.message || "request failed";
    }
}

function clearTargets() {
    const t = el("targets");
    if (t) t.value = "";
}

function bindWordlistPicker() {
    const input = el("wordlistFile");
    const hidden = el("wordlistId");
    if (!input || !hidden) return;

    input.addEventListener("click", () => { input.value = ""; });

    input.addEventListener("change", async () => {
        hidden.value = "";
        const sel = el("wordlistSelect");
        if (sel) sel.value = "";
        const file = input.files && input.files[0];
        if (!file) {
            setWordlistStatus("No file selected.");
            return;
        }

        try {
            await ensureWordlistId();
        } catch (e) {
            setWordlistStatus(e?.message || "wordlist upload failed", true);
        }
    });
}

async function refreshWordlists() {
    const sel = el("wordlistSelect");
    if (!sel) return;

    const d = unwrap(await apiFetch("/api/wordlists"));
    const items = d.items ?? d.wordlists ?? d.results ?? [];

    const keep = sel.value || "";
    sel.innerHTML = `<option value="">(none)</option>`;
    for (const it of items) {
        const opt = document.createElement("option");
        opt.value = it.id;
        opt.textContent = `${it.name} (${String(it.id).slice(0, 12)})`;
        sel.appendChild(opt);
    }
    sel.value = keep;
}

function getSelectedWordlistId() {
    const hidden = el("wordlistId");
    const sel = el("wordlistSelect");

    const idHidden = (hidden?.value || "").trim();
    if (idHidden) return idHidden;

    const idSel = (sel?.value || "").trim();
    if (idSel) return idSel;

    return "";
}

function bindExistingWordlists() {
    const sel = el("wordlistSelect");
    const hidden = el("wordlistId");
    const file = el("wordlistFile");
    if (!sel || !hidden) return;

    el("refreshWordlistsBtn")?.addEventListener("click", async (e) => {
        e.preventDefault();
        try { await refreshWordlists(); } catch {}
    });

    el("deleteWordlistBtn")?.addEventListener("click", async (e) => {
        e.preventDefault();

        const id = getSelectedWordlistId();
        if (!id) {
            setWordlistStatus("No wordlist selected.");
            return;
        }

        if (!confirm("Delete this wordlist from the server?")) return;

        try {
            await apiFetch(`/api/wordlists?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        } catch (err) {
            setWordlistStatus(err?.message || "delete failed", true);
            return;
        }

        sel.value = "";
        hidden.value = "";
        if (file) file.value = "";
        setWordlistStatus("Wordlist deleted.");
        refreshWordlists().catch(() => {});
    });

    sel.addEventListener("change", () => {
        const id = sel.value || "";
        hidden.value = id;

        if (file) file.value = "";

        if (!id) {
            setWordlistStatus("No wordlist selected.");
            return;
        }

        const name = sel.options[sel.selectedIndex]?.textContent || id.slice(0, 12);
        setWordlistStatus(`Selected: ${name}`);
    });

    refreshWordlists().catch(() => {});
}

export function bindLaunchForm() {
    const proxyEl = el("proxy");
    if (proxyEl) {
        try { proxyEl.value = localStorage.getItem(PROXY_KEY) || ""; } catch {}
        proxyEl.addEventListener("input", () => {
            try { localStorage.setItem(PROXY_KEY, proxyEl.value || ""); } catch {}
        });
    }

    bindWordlistPicker();
    bindExistingWordlists();

    el("startBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        startScan();
    });

    el("clearBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        clearTargets();
    });
}
