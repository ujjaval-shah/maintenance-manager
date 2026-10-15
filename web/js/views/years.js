// Manage financial years of one complex.
App.route("/c/:cid/years", async (view, { cid }) => {
  const { esc, inr, ctx } = App;
  App.breadcrumb([{ label: ctx.complex.name }, { label: "Financial years" }]);
  const list = await Api.call("list_years", cid);

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${esc(ctx.complex.name)}</h1>
        <div class="sub">${esc(ctx.complex.address)}${ctx.complex.gst_number ? " · GST " + esc(ctx.complex.gst_number) : ""}</div>
      </div>
      <button class="btn primary" id="add">+ Add financial year</button>
    </div>
    <div class="table-wrap">
      ${list.length ? `<table class="data">
        <thead><tr><th>Financial year</th><th>Period</th><th class="num">Rate / sq ft</th>
          <th class="num">Shops</th><th class="num">Records</th><th></th></tr></thead>
        <tbody>${list.map((f) => `
          <tr>
            <td><strong>FY ${esc(f.label)}</strong></td>
            <td>${App.fmtDate(f.start_date)} to ${App.fmtDate(f.end_date)}</td>
            <td class="num">${inr(f.rate)}</td>
            <td class="num">${f.shop_count}</td>
            <td class="num">${f.collection_count}</td>
            <td><div class="actions">
              <a class="btn small primary" href="#/c/${cid}/fy/${f.id}/collections">Open</a>
              <button class="btn small" data-edit="${f.id}">Edit rate</button>
              <button class="btn small danger" data-del="${f.id}">Delete</button>
            </div></td>
          </tr>`).join("")}</tbody></table>`
      : `<div class="empty">No financial years yet.</div>`}
    </div>`;

  const byId = Object.fromEntries(list.map((f) => [f.id, f]));
  const now = new Date();
  const defaultStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  view.querySelector("#add").onclick = async () => {
    const ok = await App.modal({
      title: "Add financial year",
      body: `
        <div class="form-grid">
          <label class="field">Start year *<input name="start_year" type="number" min="1990" max="2200" value="${defaultStart}" required>
            <span class="hint" id="fy-preview"></span></label>
          <label class="field">Maintenance rate (₹ per sq ft) *<input name="rate" type="number" step="0.01" min="0.01" required></label>
          <label class="field full">Copy shops from
            <select name="copy_shops_from">
              <option value="">— Don't copy, start empty —</option>
              ${list.map((f) => `<option value="${f.id}">FY ${esc(f.label)} (${f.shop_count} shops)</option>`).join("")}
            </select>
            <span class="hint">Copies shop numbers, owner details and areas into the new year.</span>
          </label>
        </div>`,
      onOpen: (f) => {
        const upd = () => {
          const y = Number(f.start_year.value);
          f.querySelector("#fy-preview").textContent = y ? `FY ${y}-${String((y + 1) % 100).padStart(2, "0")} (1 Apr ${y} – 31 Mar ${y + 1})` : "";
        };
        f.start_year.oninput = upd; upd();
        if (list.length) f.copy_shops_from.value = list[0].id;
      },
      onSubmit: (f) => {
        if (!f.rate.value) throw new Error("Maintenance rate is required.");
        return Api.call("create_year", cid, App.formData(f));
      },
    });
    if (ok) { App.toast(`FY ${ok.label} created`, "success"); App.render(); }
  };

  view.querySelectorAll("[data-edit]").forEach((b) => b.onclick = async () => {
    const f = byId[b.dataset.edit];
    const ok = await App.modal({
      title: `Edit FY ${f.label}`,
      body: `<label class="field">Maintenance rate (₹ per sq ft) *
               <input name="rate" type="number" step="0.01" min="0.01" value="${esc(f.rate)}" required>
               <span class="hint">Existing records keep the amount calculated when they were saved.</span></label>`,
      onSubmit: (form) => Api.call("update_year", f.id, App.formData(form)),
    });
    if (ok) { App.refreshContext(); App.toast("Rate updated", "success"); App.render(); }
  });

  view.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    const f = byId[b.dataset.del];
    const ok = await App.modal({
      title: "Delete financial year", danger: true, submitLabel: "Delete",
      body: `<p>Delete <strong>FY ${esc(f.label)}</strong>?</p>`,
      onSubmit: () => Api.call("delete_year", f.id),
    });
    if (ok) { App.toast("Financial year deleted", "success"); App.render(); }
  });
});
