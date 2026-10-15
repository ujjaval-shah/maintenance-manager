// Core: router, breadcrumb, shared UI helpers.
const App = (() => {
  const routes = [];
  const view = document.getElementById("view");
  const crumbEl = document.getElementById("breadcrumb");

  // ---------- helpers ----------
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const inr = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (v) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // yyyy-mm-dd -> dd-mm-yyyy
  const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

  function toast(message, kind = "") {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = message;
    document.getElementById("toast-root").appendChild(el);
    setTimeout(() => el.remove(), kind === "error" ? 6000 : 3000);
  }

  // Generic modal. `onSubmit(form)` may throw to show an inline error; resolve to close.
  function modal({ title, body, submitLabel = "Save", danger = false, onSubmit, onOpen }) {
    return new Promise((resolve) => {
      const root = document.getElementById("modal-root");
      root.innerHTML = `
        <div class="modal-backdrop">
          <form class="modal" novalidate>
            <header>${esc(title)}</header>
            <div class="body">${body}<div class="error" hidden></div></div>
            <footer>
              <button type="button" class="btn" data-cancel>Cancel</button>
              <button type="submit" class="btn ${danger ? "danger" : "primary"}">${esc(submitLabel)}</button>
            </footer>
          </form>
        </div>`;
      const form = root.querySelector("form");
      const errEl = root.querySelector(".error");
      const close = (value) => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); resolve(value); };
      const onKey = (e) => { if (e.key === "Escape") close(null); };
      document.addEventListener("keydown", onKey);
      root.querySelector("[data-cancel]").onclick = () => close(null);
      form.onsubmit = async (e) => {
        e.preventDefault();
        errEl.hidden = true;
        try {
          const result = onSubmit ? await onSubmit(form) : true;
          close(result ?? true);
        } catch (err) {
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      };
      if (onOpen) onOpen(form);
      const first = form.querySelector("input:not([readonly]), select, textarea");
      if (first) first.focus();
    });
  }

  function confirmDialog(title, message, { submitLabel = "Confirm", danger = false, html = false } = {}) {
    return modal({ title, body: html ? message : `<p>${esc(message)}</p>`, submitLabel, danger });
  }

  const formData = (form) => Object.fromEntries(new FormData(form).entries());

  // ---------- context (selected complex / FY) ----------
  const ctx = { complex: null, fy: null };

  async function loadContext(cid, fid) {
    if (cid && (!ctx.complex || ctx.complex.id !== cid)) ctx.complex = await Api.call("get_complex", cid);
    if (!cid) ctx.complex = null;
    if (fid && (!ctx.fy || ctx.fy.id !== fid)) ctx.fy = await Api.call("get_year", fid);
    if (!fid) ctx.fy = null;
  }

  function refreshContext() { ctx.complex = null; ctx.fy = null; }

  const fyBase = () => `#/c/${ctx.complex.id}/fy/${ctx.fy.id}`;

  // ---------- breadcrumb ----------
  function breadcrumb(items) {
    const parts = [{ label: "Home", href: "#/" }, ...items];
    crumbEl.innerHTML = parts.map((p, i) => {
      const last = i === parts.length - 1;
      const node = last || !p.href ? `<span class="${last ? "current" : ""}">${esc(p.label)}</span>`
                                   : `<a href="${p.href}">${esc(p.label)}</a>`;
      return (i ? '<span class="sep">›</span>' : "") + node;
    }).join("");
  }

  // Breadcrumb for pages inside a financial year.
  function fyCrumb(...rest) {
    breadcrumb([
      { label: ctx.complex.name, href: `#/c/${ctx.complex.id}/years` },
      { label: `FY ${ctx.fy.label}`, href: `${fyBase()}/collections` },
      ...rest,
    ]);
  }

  function fyHeader(active) {
    const tabs = [["shops", "Shops"], ["collections", "Maintenance Collections"], ["reports", "Reports"]];
    return `
      <div class="page-head">
        <div>
          <h1>${esc(ctx.complex.name)} — FY ${esc(ctx.fy.label)}</h1>
          <div class="sub">${esc(fmtDate(ctx.fy.start_date))} to ${esc(fmtDate(ctx.fy.end_date))} ·
            Rate ${inr(ctx.fy.rate)} per sq ft</div>
        </div>
      </div>
      <nav class="tabs">${tabs.map(([k, l]) =>
        `<a href="${fyBase()}/${k}" class="${k === active ? "active" : ""}">${l}</a>`).join("")}</nav>`;
  }

  // ---------- router ----------
  function route(pattern, handler) {
    const keys = [];
    const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
    routes.push({ re, keys, handler });
  }

  async function render() {
    const hash = location.hash.slice(1) || "/";
    const [path, qs] = hash.split("?");
    const query = Object.fromEntries(new URLSearchParams(qs || ""));
    for (const r of routes) {
      const m = path.match(r.re);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = /^\d+$/.test(m[i + 1]) ? Number(m[i + 1]) : m[i + 1]; });
      try {
        await loadContext(params.cid, params.fid);
        await r.handler(view, params, query);
      } catch (err) {
        console.error(err);
        view.innerHTML = `<div class="card"><h2>Something went wrong</h2><p>${esc(err.message)}</p>
          <a class="btn" href="#/">Go to start</a></div>`;
      }
      window.scrollTo(0, 0);
      return;
    }
    location.hash = "#/";
  }

  function go(hash) {
    if (location.hash === hash) render(); else location.hash = hash;
  }

  window.addEventListener("hashchange", render);
  // Wait for both the bridge and the view scripts (loaded after this file) before routing.
  const domReady = new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }));
  Promise.all([Api.ready, domReady]).then(render);

  return { route, go, render, esc, inr, num, today, fmtDate, toast, modal, confirmDialog,
           formData, ctx, fyBase, breadcrumb, fyCrumb, fyHeader, refreshContext };
})();
