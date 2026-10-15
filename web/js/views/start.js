// Start screen: pick business complex, then financial year.
App.route("/", async (view) => {
  const { esc } = App;
  App.breadcrumb([{ label: "Select complex & financial year" }]);
  const complexes = await Api.call("list_complexes");
  const last = JSON.parse(localStorage.getItem("lastSelection") || "{}");

  view.innerHTML = `
    <div class="card narrow">
      <h1>Welcome</h1>
      <p class="muted">Select the business complex and financial year to work in.</p>
      ${complexes.length ? `
      <form id="pick" class="form-grid" style="grid-template-columns:1fr">
        <label class="field">Business complex
          <select name="complex" required>
            ${complexes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}
          </select>
        </label>
        <label class="field">Financial year
          <select name="fy" required></select>
          <span class="hint" id="fy-hint"></span>
        </label>
        <div><button class="btn primary" type="submit">Continue</button></div>
      </form>` : `<p>No business complexes yet. Create one to get started.</p>`}
      <div class="start-links">
        <a class="btn" href="#/complexes">Manage complexes</a>
        <a class="btn" id="manage-fy" href="#/complexes">Manage financial years</a>
      </div>
    </div>`;

  if (!complexes.length) return;
  const form = view.querySelector("#pick");
  const cSel = form.complex, fSel = form.fy;
  const hint = view.querySelector("#fy-hint");
  const manageFy = view.querySelector("#manage-fy");

  async function loadYears() {
    const years = await Api.call("list_years", Number(cSel.value));
    fSel.innerHTML = years.map((f) => `<option value="${f.id}">FY ${esc(f.label)} (₹${esc(f.rate)}/sq ft)</option>`).join("");
    if (last.fy && years.some((f) => f.id === last.fy)) fSel.value = last.fy;
    fSel.disabled = !years.length;
    form.querySelector("button[type=submit]").disabled = !years.length;
    hint.textContent = years.length ? "" : "No financial years for this complex yet — use Manage financial years.";
    manageFy.href = `#/c/${cSel.value}/years`;
  }

  if (last.complex && complexes.some((c) => c.id === last.complex)) cSel.value = last.complex;
  cSel.onchange = loadYears;
  await loadYears();

  form.onsubmit = (e) => {
    e.preventDefault();
    const sel = { complex: Number(cSel.value), fy: Number(fSel.value) };
    localStorage.setItem("lastSelection", JSON.stringify(sel));
    App.go(`#/c/${sel.complex}/fy/${sel.fy}/collections`);
  };
});
