// Maintenance collection records: list + create/edit form.
App.route("/c/:cid/fy/:fid/collections", async (view, { fid }) => {
  const { esc, inr, fmtDate } = App;
  App.fyCrumb({ label: "Maintenance collections" });
  const list = await Api.call("list_collections", fid);
  const total = list.reduce((s, c) => s + c.amount_paise, 0) / 100;

  view.innerHTML = `
    ${App.fyHeader("collections")}
    <div class="page-head" style="margin-bottom:12px">
      <div class="toolbar">
        <input class="search" id="q" placeholder="Search receipt / shop / owner / cheque">
        <span class="muted">${list.length} records · ${inr(total)} collected</span>
      </div>
      <a class="btn primary" href="${App.fyBase()}/collections/new">+ New collection</a>
    </div>
    <div class="table-wrap">
      ${list.length ? `<table class="data">
        <thead><tr><th>Receipt no.</th><th>Date</th><th>Main shop</th><th>Sub shops</th><th>Owner</th>
          <th>Mode</th><th class="num">Amount</th><th></th></tr></thead>
        <tbody>${list.map((c) => `
          <tr data-search="${esc([c.receipt_no, c.main_shop_number, c.sub_shop_numbers, c.owner_name, c.cheque_number].join(" ").toLowerCase())}">
            <td class="nowrap"><strong>${esc(c.receipt_no)}</strong></td>
            <td class="nowrap">${fmtDate(c.payment_date)}</td>
            <td>${esc(c.main_shop_number)}</td>
            <td>${esc(c.sub_shop_numbers || "—")}</td>
            <td>${esc(c.owner_name)}</td>
            <td><span class="badge ${c.mode.toLowerCase()}">${c.mode === "CASH" ? "Cash" : "Cheque"}</span>
              ${c.cheque_number ? `<div class="muted">#${esc(c.cheque_number)}</div>` : ""}</td>
            <td class="num nowrap">${inr(c.amount)}
              ${c.amount_mismatch ? `<div><span class="badge warn" title="Calculated ${inr(c.calculated)}">≠ ${inr(c.calculated)}</span></div>` : ""}</td>
            <td><div class="actions">
              <a class="btn small" href="${App.fyBase()}/collections/${c.id}/receipt">Receipt</a>
              <a class="btn small" href="${App.fyBase()}/collections/${c.id}/edit">Edit</a>
              <button class="btn small danger" data-del="${c.id}">Delete</button>
            </div></td>
          </tr>`).join("")}</tbody></table>`
      : `<div class="empty">No maintenance collected yet in this financial year.</div>`}
    </div>`;

  const q = view.querySelector("#q");
  q.oninput = () => {
    const term = q.value.trim().toLowerCase();
    view.querySelectorAll("tbody tr").forEach((tr) => { tr.hidden = term && !tr.dataset.search.includes(term); });
  };

  const byId = Object.fromEntries(list.map((c) => [c.id, c]));
  view.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    const c = byId[b.dataset.del];
    const ok = await App.modal({
      title: "Delete maintenance record", danger: true, submitLabel: "Delete",
      body: `<p>Delete receipt <strong>${esc(c.receipt_no)}</strong> (${esc(c.owner_name)}, ${inr(c.amount)})?</p>
             <p class="muted">The receipt number will not be reused.</p>`,
      onSubmit: () => Api.call("delete_collection", c.id),
    });
    if (ok) { App.toast("Record deleted", "success"); App.render(); }
  });
});

App.route("/c/:cid/fy/:fid/collections/new", (view, p) => collectionForm(view, p, null));
App.route("/c/:cid/fy/:fid/collections/:id/edit", (view, p) => collectionForm(view, p, p.id));

async function collectionForm(view, { fid }, editId) {
  const { esc, inr, num } = App;
  const [shops, existing] = await Promise.all([
    Api.call("list_shops", fid),
    editId ? Api.call("get_collection", editId) : null,
  ]);
  if (existing && existing.fy_id !== fid) throw new Error("This record belongs to a different financial year.");
  App.fyCrumb({ label: "Maintenance collections", href: `${App.fyBase()}/collections` },
              { label: existing ? `Edit ${existing.receipt_no}` : "New collection" });

  if (!shops.length) {
    view.innerHTML = `${App.fyHeader("collections")}
      <div class="card"><p>Add shops to this financial year before recording collections.</p>
      <a class="btn primary" href="${App.fyBase()}/shops">Go to shops</a></div>`;
    return;
  }

  const shopById = Object.fromEntries(shops.map((s) => [s.id, s]));
  // Receipts a shop is already part of, ignoring the record being edited.
  const paidIn = (s) => (s.receipts || "").split(", ").filter((r) => r && (!existing || r !== existing.receipt_no));
  const shopLabel = (s) => `${s.shop_number} — ${s.owner_name} (${num(s.area_sqft)} sq ft)`;

  view.innerHTML = `
    ${App.fyHeader("collections")}
    <form id="cform" novalidate>
      <div class="collection-layout">
        <div class="card">
          <h2>${existing ? `Edit receipt ${esc(existing.receipt_no)}` : "New maintenance collection"}</h2>
          <div class="form-grid">
            <label class="field full">Main shop *
              <input id="main-filter" placeholder="Type to filter shops…">
              <select name="main_shop_id" size="5" required>
                ${shops.map((s) => `<option value="${s.id}">${esc(shopLabel(s))}${paidIn(s).length ? " — paid" : ""}</option>`).join("")}
              </select>
            </label>
            <div class="full owner-box" id="owner"><span class="muted">Select the main shop to see owner details.</span></div>

            <div class="field full">
              <span>Additional (sub) shops paid together <span class="hint">— shops of the same owner are listed first</span></span>
              <input id="sub-filter" placeholder="Filter sub shops…">
              <div class="shop-picker" id="subs"></div>
            </div>

            <label class="field">Date of payment *<input type="date" name="payment_date" required></label>
            <label class="field">Amount paid (₹) *
              <input type="number" name="amount" step="0.01" min="0.01" required>
              <span class="hint" id="amount-hint"></span></label>

            <div class="field">Mode of payment *
              <div class="radio-row">
                <label><input type="radio" name="mode" value="CASH" checked> Cash</label>
                <label><input type="radio" name="mode" value="CHEQUE"> Cheque</label>
              </div>
            </div>
            <label class="field" id="cheque-field" hidden>Cheque number *<input name="cheque_number" maxlength="20"></label>
          </div>
          <div id="warnings"></div>
        </div>

        <div class="card summary">
          <h2>Summary</h2>
          <dl>
            <dt>Shops</dt><dd id="s-shops">—</dd>
            <dt>Total area</dt><dd id="s-area">—</dd>
            <dt>Rate</dt><dd>${inr(App.ctx.fy.rate)} / sq ft</dd>
            <dt>Calculated maintenance</dt><dd class="big" id="s-calc">—</dd>
          </dl>
          <div class="actions" style="margin-top:20px">
            <a class="btn" href="${App.fyBase()}/collections">Cancel</a>
            <button class="btn primary" type="submit">${existing ? "Save changes" : "Save & view receipt"}</button>
          </div>
        </div>
      </div>
    </form>`;

  const form = view.querySelector("#cform");
  const mainSel = form.main_shop_id;
  const subsEl = view.querySelector("#subs");
  const amountEl = form.amount;
  const chequeField = view.querySelector("#cheque-field");
  let selectedSubs = new Set(existing ? existing.sub_shop_ids : []);
  let amountTouched = !!existing;

  // --- main shop filter ---
  view.querySelector("#main-filter").oninput = (e) => {
    const t = e.target.value.trim().toLowerCase();
    [...mainSel.options].forEach((o) => { o.hidden = t && !o.text.toLowerCase().includes(t); });
    const firstVisible = [...mainSel.options].find((o) => !o.hidden);
    if (firstVisible && mainSel.selectedOptions[0]?.hidden) { mainSel.value = firstVisible.value; onMainChange(); }
  };

  // --- sub shop checklist ---
  function renderSubs() {
    const main = shopById[mainSel.value];
    const t = view.querySelector("#sub-filter").value.trim().toLowerCase();
    const candidates = shops.filter((s) => !main || s.id !== main.id);
    const sameOwner = (s) => main && s.owner_name.trim().toLowerCase() === main.owner_name.trim().toLowerCase();
    candidates.sort((a, b) => (sameOwner(b) - sameOwner(a)));
    subsEl.innerHTML = candidates
      .filter((s) => selectedSubs.has(s.id) || !t || shopLabel(s).toLowerCase().includes(t))
      .map((s) => {
        const paid = paidIn(s);
        return `<label class="${sameOwner(s) ? "same-owner" : ""}">
          <input type="checkbox" value="${s.id}" ${selectedSubs.has(s.id) ? "checked" : ""}>
          <span><strong>${esc(s.shop_number)}</strong> — ${esc(s.owner_name)}
            ${paid.length ? `<span class="paid">· paid in ${esc(paid.join(", "))}</span>` : ""}</span>
          <span class="meta">${num(s.area_sqft)} sq ft</span>
        </label>`;
      }).join("") || '<div class="empty">No shops match.</div>';
    subsEl.querySelectorAll("input").forEach((cb) => cb.onchange = () => {
      cb.checked ? selectedSubs.add(Number(cb.value)) : selectedSubs.delete(Number(cb.value));
      refresh();
    });
  }
  view.querySelector("#sub-filter").oninput = renderSubs;

  function onMainChange() {
    const main = shopById[mainSel.value];
    if (main) selectedSubs.delete(main.id);
    view.querySelector("#owner").innerHTML = main ? `
      <strong>${esc(main.owner_name)}</strong>
      ${main.owner_phone ? ` · ☎ ${esc(main.owner_phone)}` : ""}
      ${main.owner_gst ? ` · GST ${esc(main.owner_gst)}` : ""}` : "";
    renderSubs();
    refresh();
  }
  mainSel.onchange = onMainChange;

  // --- mode ---
  form.querySelectorAll("[name=mode]").forEach((r) => r.onchange = () => {
    chequeField.hidden = form.mode.value !== "CHEQUE";
    if (chequeField.hidden) form.cheque_number.value = "";
  });

  amountEl.oninput = () => { amountTouched = amountEl.value !== ""; refresh(); };
  form.payment_date.onchange = refresh;

  const payload = () => ({
    main_shop_id: Number(mainSel.value) || null,
    sub_shop_ids: [...selectedSubs],
    payment_date: form.payment_date.value,
    amount: amountEl.value,
    mode: form.mode.value,
    cheque_number: form.cheque_number.value,
  });

  // --- live preview (calculated amount + warnings) ---
  let seq = 0;
  async function refresh() {
    if (!mainSel.value) return;
    const my = ++seq;
    const data = payload();
    // Ask for preview without the amount first if user hasn't typed one, so we can prefill.
    const res = await Api.raw("preview_collection", fid, amountTouched ? data : { ...data, amount: "" }, editId);
    if (my !== seq) return;
    if (!res.ok) { App.toast(res.error, "error"); return; }
    let p = res.data;
    if (!amountTouched) {
      amountEl.value = p.calculated;
      const again = await Api.raw("preview_collection", fid, payload(), editId);
      if (my !== seq || !again.ok) return;
      p = again.data;
    }
    view.querySelector("#s-shops").textContent = p.shops.map((s) => s.shop_number).join(", ");
    view.querySelector("#s-area").textContent = `${num(p.total_area)} sq ft`;
    view.querySelector("#s-calc").textContent = inr(p.calculated);
    const mismatch = amountEl.value && Math.round(Number(amountEl.value) * 100) !== p.calculated_paise;
    view.querySelector("#amount-hint").innerHTML = mismatch
      ? `<span class="badge warn">Differs from calculated ${inr(p.calculated)}</span>
         <a href="#" id="use-calc">Use calculated</a>`
      : `Calculated: ${inr(p.calculated)}`;
    const useCalc = view.querySelector("#use-calc");
    if (useCalc) useCalc.onclick = (e) => { e.preventDefault(); amountTouched = false; refresh(); };
    view.querySelector("#warnings").innerHTML = p.warnings.length
      ? `<div class="warnings"><strong>Warning</strong><ul>${p.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : "";
  }

  // --- initial values ---
  if (existing) {
    mainSel.value = existing.main_shop_id;
    form.payment_date.value = existing.payment_date;
    amountEl.value = existing.amount;
    form.mode.value = existing.mode;
    form.cheque_number.value = existing.cheque_number || "";
    chequeField.hidden = existing.mode !== "CHEQUE";
  } else {
    form.payment_date.value = App.today();
    const firstUnpaid = shops.find((s) => !paidIn(s).length) || shops[0];
    mainSel.value = firstUnpaid.id;
  }
  onMainChange();

  // --- save ---
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = payload();
    const save = (confirm) => editId
      ? Api.raw("update_collection", editId, data, confirm)
      : Api.raw("create_collection", fid, data, confirm);
    let res = await save(false);
    if (!res.ok && res.needs_confirm) {
      const ok = await App.confirmDialog("Please confirm",
        `<p>This record has the following warnings:</p>
         <div class="warnings"><ul>${res.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>
         <p>Save anyway?</p>`, { submitLabel: "Save anyway", html: true });
      if (!ok) return;
      res = await save(true);
    }
    if (!res.ok) { App.toast(res.error, "error"); return; }
    App.toast(`Receipt ${res.data.receipt_no} saved`, "success");
    App.go(`${App.fyBase()}/collections/${res.data.id}/receipt`);
  };
}
