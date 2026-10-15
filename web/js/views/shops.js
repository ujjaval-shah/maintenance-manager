// Shops of the selected financial year.
App.route("/c/:cid/fy/:fid/shops", async (view, { fid }) => {
  const { esc, inr, num } = App;
  App.fyCrumb({ label: "Shops" });
  const list = await Api.call("list_shops", fid);
  const totalArea = list.reduce((s, x) => s + x.area_sqft, 0);

  view.innerHTML = `
    ${App.fyHeader("shops")}
    <div class="page-head" style="margin-bottom:12px">
      <div class="toolbar">
        <input class="search" id="q" placeholder="Search shop no. / owner / phone">
        <span class="muted">${list.length} shops · ${num(totalArea)} sq ft</span>
      </div>
      <button class="btn primary" id="add">+ Add shop</button>
    </div>
    <div class="table-wrap">
      ${list.length ? `<table class="data">
        <thead><tr><th>Shop no.</th><th>Owner</th><th>Phone</th><th>Owner GST</th>
          <th class="num">Area (sq ft)</th><th class="num">Maintenance</th><th>Paid in receipt</th><th></th></tr></thead>
        <tbody>${list.map((s) => `
          <tr data-search="${esc([s.shop_number, s.owner_name, s.owner_phone].join(" ").toLowerCase())}">
            <td><strong>${esc(s.shop_number)}</strong></td>
            <td>${esc(s.owner_name)}</td>
            <td>${esc(s.owner_phone || "—")}</td>
            <td>${esc(s.owner_gst || "—")}</td>
            <td class="num">${num(s.area_sqft)}</td>
            <td class="num">${inr(s.due)}</td>
            <td>${s.receipts ? esc(s.receipts) : '<span class="badge warn">Pending</span>'}</td>
            <td><div class="actions">
              <button class="btn small" data-edit="${s.id}">Edit</button>
              <button class="btn small danger" data-del="${s.id}">Delete</button>
            </div></td>
          </tr>`).join("")}</tbody></table>`
      : `<div class="empty">No shops in this financial year yet.</div>`}
    </div>`;

  const byId = Object.fromEntries(list.map((s) => [s.id, s]));

  const q = view.querySelector("#q");
  q.oninput = () => {
    const term = q.value.trim().toLowerCase();
    view.querySelectorAll("tbody tr").forEach((tr) => { tr.hidden = term && !tr.dataset.search.includes(term); });
  };

  const formBody = (s = {}) => `
    <div class="form-grid">
      <label class="field">Shop number *
        <input name="shop_number" value="${esc(s.shop_number)}" ${s.id ? "readonly" : "required"}>
        ${s.id ? '<span class="hint">Shop number cannot be changed.</span>' : ""}</label>
      <label class="field">Area (sq ft) *<input name="area_sqft" type="number" step="0.01" min="0.01" value="${esc(s.area_sqft)}" required></label>
      <label class="field full">Owner name *<input name="owner_name" value="${esc(s.owner_name)}" required></label>
      <label class="field">Owner phone<input name="owner_phone" value="${esc(s.owner_phone)}" maxlength="15"></label>
      <label class="field">Owner GST number<input name="owner_gst" value="${esc(s.owner_gst)}" maxlength="15"></label>
    </div>`;

  view.querySelector("#add").onclick = async () => {
    const ok = await App.modal({
      title: "Add shop", body: formBody(),
      onSubmit: (f) => Api.call("create_shop", fid, App.formData(f)),
    });
    if (ok) { App.toast(`Shop ${ok.shop_number} added`, "success"); App.render(); }
  };

  view.querySelectorAll("[data-edit]").forEach((b) => b.onclick = async () => {
    const s = byId[b.dataset.edit];
    const ok = await App.modal({
      title: `Edit shop ${s.shop_number}`, body: formBody(s),
      onSubmit: (f) => Api.call("update_shop", s.id, App.formData(f)),
    });
    if (ok) { App.toast("Shop updated", "success"); App.render(); }
  });

  view.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    const s = byId[b.dataset.del];
    const ok = await App.modal({
      title: "Delete shop", danger: true, submitLabel: "Delete",
      body: `<p>Delete shop <strong>${esc(s.shop_number)}</strong> (${esc(s.owner_name)})?</p>`,
      onSubmit: () => Api.call("delete_shop", s.id),
    });
    if (ok) { App.toast("Shop deleted", "success"); App.render(); }
  });
});
