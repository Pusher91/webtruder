import { el } from "./dom.js";

export function createNetinfoPanel() {
    function renderNetInfo(d) {
        const e = el("egress");
        if (!e) return;

        e.innerHTML = "";

        if (!d) {
            e.textContent = "No IPv4 detected.";
            return;
        }

        const local = d.outboundLocalIPv4 || "";
        const pub = d.publicIPv4 || "";
        const pubEnabled = d.publicIPv4Enabled === true;
        const ips = Array.isArray(d.localIPv4) ? d.localIPv4 : [];

        function add(text) {
            const span = document.createElement("span");
            span.className = "whitespace-nowrap";
            span.textContent = text;
            e.appendChild(span);
        }

        if (local) add(`Local IPv4: ${local}`);
        else if (ips.length) add(`Local IPv4: ${ips.join(", ")}`);

        if (pubEnabled) {
            if (pub) add(`Public IPv4: ${pub}`);
            else add(`Public IPv4: unavailable`);
        } else {
            add(`Public IPv4: disabled (start webtruder with --enable-ipify)`);
        }

        if (!e.childNodes.length) {
            e.textContent = "No IPv4 detected.";
        }
    }

    return { renderNetInfo };
}
