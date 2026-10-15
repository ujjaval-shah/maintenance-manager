// Reports: cash entries, cheque entries, pending payments. All printable.
const REPORTS = {
  cash: { title: "Cash entries", desc: "Collections received in cash between two dates." },
  cheque: { title: "Cheque entries", desc: "Collections received by cheque between two dates." },
  pending: { title: "Pending maintenance", desc: "Shops not yet covered by any collection this year." },
};

App.route("/c/:cid/fy/:fid/reports", (view) => reportsPage(view, null, {}));
App.route("/c/:cid/fy/:fid/reports/:kind", (view, { kind }, query) => reportsPage(view, kind, query));

async function reportsPage(view, kind, query) {
  const { esc } = App;
  if (kind && !REPORTS[kind]) { App.go(`${App.fyBase()}/reports`); return; }
  App.fyCrumb(...(kind
    ? [{ label: "Reports", href: `${App.fyBase()}/reports` }, { label: REPORTS[kind].title }]
    : [{ label: "Reports" }]));

  view.innerHTML = `
    ${App.fyHeader("reports")}
    <div class="report-cards">
      ${Object.entries(REPORTS).map(([k, r]) => `
        <a class="card ${k === kind ? "active" : ""}" href="${App.fyBase()}/reports/${k}">
          <strong>${r.title}</strong><p>${r.desc}</p></a>`).join("")}
    </div>
    <div id="report-body">${kind ? "" : '<div class="card muted">Choose a report above.</div>'}</div>`;

  if (!kind) return;
  const body = view.querySelector("#report-body");
  if (kind === "pending") return renderPending(body);

  const start = query.start || App.today();
  const end = query.end || App.today();
  body.innerHTML = `
    <form class="card toolbar" id="range">
      <label class="field">Start date<input type="date" name="start" value="${esc(start)}" required></label>
      <label class="field">End date<input type="date" name="end" value="${esc(end)}" required></label>
      <div style="align-self:flex-end" class="toolbar">
        <button class="btn primary" type="submit">Show report</button>
      </div>
    </form>
    <div id="result"></div>`;
  body.querySelector("#range").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    App.go(`${App.fyBase()}/reports/${kind}?start=${f.start.value}&end=${f.end.value}`);
  };
  await renderModeReport(body.querySelector("#result"), kind, start, end);
}

function docHead(r, title, subtitle) {
  const { esc } = App;
  return `
    <div class="doc-head">
      <div class="org">${esc(r.complex_name)}</div>
      <div class="addr">${esc(r.complex_address)}</div>
      ${r.complex_gst ? `<div>GSTIN: ${esc(r.complex_gst)}</div>` : ""}
      <div class="title">${esc(title)}</div>
      <div>FY ${esc(r.fy_label)}${subtitle ? " · " + esc(subtitle) : ""}</div>
    </div>`;
}

const printBar = (count) => `
  <div class="toolbar" style="justify-content:space-between;margin-bottom:10px">
    <span class="muted">${count} row(s)</span>
    <button class="btn primary" data-print>🖨 Print report</button>
  </div>`;

async function renderModeReport(el, kind, start, end) {
  const { esc, inr, fmtDate } = App;
  const fid = App.ctx.fy.id;
  let r;
  try {
    r = await Api.call(kind === "cash" ? "cash_report" : "cheque_report", fid, start, end);
  } catch (err) {
    el.innerHTML = `<div class="card">${esc(err.message)}</div>`;
    return;
  }
  const isCheque = kind === "cheque";
  const cols = isCheque ? 5 : 4;
  el.innerHTML = `
    ${printBar(r.count)}
    <div class="doc">
      ${docHead(r, isCheque ? "Maintenance Collection — Cheque Entries" : "Maintenance Collection — Cash Entries",
                `${fmtDate(r.start)} to ${fmtDate(r.end)}`)}
      <table class="data">
        <thead><tr><th>Date</th><th>Receipt no.</th><th>Shop no.</th>
          ${isCheque ? "<th>Cheque no.</th>" : ""}<th class="num">Amount</th></tr></thead>
        <tbody>
          ${r.rows.map((x) => `<tr>
            <td>${fmtDate(x.payment_date)}</td><td>${esc(x.receipt_no)}</td><td>${esc(x.main_shop_number)}</td>
            ${isCheque ? `<td>${esc(x.cheque_number)}</td>` : ""}<td class="num">${inr(x.amount)}</td></tr>`).join("")
          || `<tr><td colspan="${cols}" class="empty">No ${kind} entries in this period.</td></tr>`}
        </tbody>
        <tfoot><tr><td colspan="${cols - 1}">Total ${isCheque ? "collected by cheque" : "cash collected"} (${r.count} receipts)</td>
          <td class="num">${inr(r.total)}</td></tr></tfoot>
      </table>
    </div>`;
  el.querySelector("[data-print]").onclick = () => window.print();
}

async function renderPending(el) {
  const { esc, inr, num } = App;
  const r = await Api.call("pending_report", App.ctx.fy.id);
  el.innerHTML = `
    ${printBar(r.count)}
    <div class="doc">
      ${docHead(r, "Pending Maintenance Payments", `As on ${App.fmtDate(App.today())} · Rate ₹${r.rate}/sq ft`)}
      <table class="data">
        <thead><tr><th>#</th><th>Shop no.</th><th>Owner</th><th>Phone</th>
          <th class="num">Area (sq ft)</th><th class="num">Maintenance due</th></tr></thead>
        <tbody>
          ${r.rows.map((x, i) => `<tr>
            <td>${i + 1}</td><td>${esc(x.shop_number)}</td><td>${esc(x.owner_name)}</td>
            <td>${esc(x.owner_phone || "—")}</td><td class="num">${num(x.area_sqft)}</td>
            <td class="num">${inr(x.due)}</td></tr>`).join("")
          || '<tr><td colspan="6" class="empty">All shops have paid maintenance for this year. 🎉</td></tr>'}
        </tbody>
        <tfoot><tr><td colspan="4">Total pending (${r.count} shops)</td>
          <td class="num">${num(r.total_area)}</td><td class="num">${inr(r.total)}</td></tr></tfoot>
      </table>
    </div>`;
  el.querySelector("[data-print]").onclick = () => window.print();
}
