// Printable maintenance receipt.
App.route("/c/:cid/fy/:fid/collections/:id/receipt", async (view, { id }) => {
  const { esc, inr, num, fmtDate } = App;
  const r = await Api.call("get_receipt", id);
  if (r.fy_id !== App.ctx.fy.id) throw new Error("This record belongs to a different financial year.");
  App.fyCrumb({ label: "Maintenance collections", href: `${App.fyBase()}/collections` },
              { label: `Receipt ${r.receipt_no}` });

  view.innerHTML = `
    <div class="page-head">
      <div><h1>Receipt ${esc(r.receipt_no)}</h1></div>
      <div class="toolbar">
        <a class="btn" href="${App.fyBase()}/collections">← Back</a>
        <a class="btn" href="${App.fyBase()}/collections/${r.id}/edit">Edit</a>
        <button class="btn primary" id="print">🖨 Print receipt</button>
      </div>
    </div>
    <div class="doc receipt">
      <div class="doc-head">
        <div class="org">${esc(r.complex.name)}</div>
        <div class="addr">${esc(r.complex.address)}</div>
        ${r.complex.gst_number ? `<div>GSTIN: <strong>${esc(r.complex.gst_number)}</strong></div>` : ""}
        <div class="title">MAINTENANCE RECEIPT</div>
      </div>
      <div class="doc-meta">
        <div>Receipt No.: <strong>${esc(r.receipt_no)}</strong></div>
        <div>Financial Year: <strong>${esc(r.fy_label)}</strong></div>
        <div>Date of Payment: <strong>${fmtDate(r.payment_date)}</strong></div>
      </div>

      <div class="line"><span class="k">Received from</span><span class="v">${esc(r.owner_name)}</span></div>
      ${r.owner_gst ? `<div class="line"><span class="k">Owner GSTIN</span><span class="v">${esc(r.owner_gst)}</span></div>` : ""}

      <p style="margin:14px 0 6px">Maintenance for the following shop(s):</p>
      <table class="data">
        <thead><tr><th>#</th><th>Shop no.</th><th class="num">Area (sq ft)</th></tr></thead>
        <tbody>${r.shops.map((s, i) => `
          <tr><td>${i + 1}</td><td>${esc(s.shop_number)}</td><td class="num">${num(s.area_sqft)}</td></tr>`).join("")}
        </tbody>
        <tfoot><tr><td colspan="2">Total area</td><td class="num">${num(r.total_area)}</td></tr></tfoot>
      </table>

      <div class="line" style="margin-top:14px"><span class="k">Amount paid</span><span class="v">${inr(r.amount)}</span></div>
      <div class="line"><span class="k">In words</span><span class="v">${esc(r.amount_words)}</span></div>
      <div class="line"><span class="k">Mode of payment</span>
        <span class="v">${r.mode === "CASH" ? "Cash" : `Cheque (No. ${esc(r.cheque_number)})`}</span></div>

      <div class="amount-box">${inr(r.amount)}</div>

      <div class="sign">
        <div>Payer's signature</div>
        <div>Authorised signatory</div>
      </div>
    </div>`;

  view.querySelector("#print").onclick = () => window.print();
});
