// Manage business complexes.
App.route("/complexes", async (view) => {
  const { esc } = App;
  App.breadcrumb([{ label: "Business complexes" }]);
  const list = await Api.call("list_complexes");

  view.innerHTML = `
    <div class="page-head">
      <div><h1>Business complexes</h1><div class="sub">Name, address and GST number of each complex.</div></div>
      <button class="btn primary" id="add">+ Add complex</button>
    </div>
    <div class="table-wrap">
      ${list.length ? `<table class="data">
        <thead><tr><th>Name</th><th>Address</th><th>GST number</th><th class="num">Financial years</th><th></th></tr></thead>
        <tbody>${list.map((c) => `
          <tr>
            <td><strong>${esc(c.name)}</strong></td>
            <td>${esc(c.address)}</td>
            <td>${esc(c.gst_number || "—")}</td>
            <td class="num">${c.fy_count}</td>
            <td><div class="actions">
              <a class="btn small" href="#/c/${c.id}/years">Financial years</a>
              <button class="btn small" data-edit="${c.id}">Edit</button>
              <button class="btn small danger" data-del="${c.id}">Delete</button>
            </div></td>
          </tr>`).join("")}</tbody></table>`
      : `<div class="empty">No complexes yet.</div>`}
    </div>`;

  const byId = Object.fromEntries(list.map((c) => [c.id, c]));

  const formBody = (c = {}) => `
    <div class="form-grid" style="grid-template-columns:1fr">
      <label class="field">Name *<input name="name" value="${esc(c.name)}" required></label>
      <label class="field">Address *<textarea name="address" required>${esc(c.address)}</textarea></label>
      <label class="field">GST number<input name="gst_number" value="${esc(c.gst_number)}" maxlength="15"></label>
    </div>`;

  view.querySelector("#add").onclick = async () => {
    const ok = await App.modal({
      title: "Add business complex", body: formBody(),
      onSubmit: (f) => Api.call("create_complex", App.formData(f)),
    });
    if (ok) { App.toast("Complex created", "success"); App.render(); }
  };

  view.querySelectorAll("[data-edit]").forEach((b) => b.onclick = async () => {
    const c = byId[b.dataset.edit];
    const ok = await App.modal({
      title: `Edit ${c.name}`, body: formBody(c),
      onSubmit: (f) => Api.call("update_complex", c.id, App.formData(f)),
    });
    if (ok) { App.refreshContext(); App.toast("Complex updated", "success"); App.render(); }
  });

  view.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    const c = byId[b.dataset.del];
    const ok = await App.modal({
      title: "Delete complex", danger: true, submitLabel: "Delete",
      body: `<p>Delete <strong>${esc(c.name)}</strong>? This cannot be undone.</p>`,
      onSubmit: () => Api.call("delete_complex", c.id),
    });
    if (ok) { App.toast("Complex deleted", "success"); App.render(); }
  });
});
