// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/team.js — edit the port script, not this file.
// Team page (inbox-only dealerships): the owner, managers and agents with their departments and stores.
// Add a person with a temporary password (shown once) or an e-mail invite; edit, new password, resend invite,
// turn off, remove. Also the store's departments. CRM dealers manage their staff in AutoPulse CRM (tab hidden).
let ctx = null;
let data = null;
let editing = null; // the person being edited, or null when adding

const ROLE_LABEL = { owner: "Owner", manager: "Manager", agent: "Agent" };

export function initTeam(deps) {
  ctx = deps;
  const { $ } = ctx;
  $("team-add-btn")?.addEventListener("click", () => openMember(null));
  $("member-cancel")?.addEventListener("click", () => $("member-dialog").close());
  $("member-form")?.addEventListener("submit", saveMember);
  $("member-form")?.addEventListener("change", (e) => { if (e.target.name === "method") paintMethod(); });
  $("departments-form")?.addEventListener("submit", saveDepartments);
  $("secret-copy")?.addEventListener("click", async () => {
    const value = $("secret-value").textContent;
    try { await navigator.clipboard.writeText(value); ctx.toast("Copied", "success"); } catch { ctx.toast("Select the password and copy it", "info"); }
  });
  $("ai-profile-form")?.addEventListener("submit", saveAiProfile);
  $("store-page-form")?.addEventListener("submit", (e) => { e.preventDefault(); saveStorePage(false); });
  $("store-page-newkey")?.addEventListener("click", () => saveStorePage(true));
  $("my-page-form")?.addEventListener("submit", saveMyPage);
  for (const [btn, link] of [["store-page-copy", "store-page-open"], ["my-page-copy", "my-page-open"]]) {
    $(btn)?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($(link).href); ctx.toast("Link copied", "success"); } catch { ctx.toast($(link).href, "info"); }
    });
  }
  $("notify-form")?.addEventListener("submit", saveNotify);
  $("app-address-form")?.addEventListener("submit", saveAppAddress);
  applyStoreKind();
  if (ctx.state?.me?.role === "admin" || ctx.state?.me?.crmAccount === "superadmin") loadAppAddress();
}

/**
 * Show only what applies to the store being viewed (again after switching store): the team, pages and store
 * settings exist for inbox-only dealerships; AutoPulse CRM dealers get neither the menu items nor the requests.
 */
export function applyStoreKind() {
  const { $ } = ctx;
  const store = ctx.state?.store || {};
  for (const view of ["staff", "pages"]) {
    const rail = document.querySelector(`.rail-btn[data-view="${view}"]`);
    // The Team page also exists for AutoPulse CRM dealers (their team comes from the CRM).
    if (rail && !store.hasTeam && !(view === "staff" && store.crmTeam)) rail.hidden = true;
  }
  if (store.hasTeam) { loadTeam(); loadStorePage(); loadMyPage(); }
  else if (store.crmTeam) loadTeam();
  else { data = null; for (const id of ["team-panel", "departments-panel", "roles-panel", "store-page-panel", "my-page-panel"]) { const n = $(id); if (n) n.hidden = true; } }
  if (store.inboxOnly) { loadAiProfile(); loadStoreSettings(); }
  else { for (const id of ["ai-profile-panel", "notify-panel"]) { const n = $(id); if (n) n.hidden = true; } const ro = $("route-options"); if (ro) ro.hidden = true; }
  ctx.refreshTabs?.();
}

// ---------- Team page → What each role can do ----------
async function loadRoles() {
  const { $, h, api } = ctx;
  let t;
  try {
    t = await api("/api/permissions");
  } catch {
    return;
  }
  if (!data) { $("roles-panel").hidden = true; return; } // only where the dealership's own team is managed here
  $("roles-panel").hidden = false;
  $("roles-head").replaceChildren(h("tr", {}, h("th", { text: "What" }), ...t.roles.map((r) => h("th", { text: r.label + (r.id === t.you.role ? " (you)" : "") }))));
  const rows = [];
  let group = "";
  for (const p of t.permissions) {
    if (p.group !== group) {
      group = p.group;
      rows.push(h("tr", {}, h("td", { class: "group", colspan: String(t.roles.length + 1), text: group })));
    }
    rows.push(h("tr", { class: t.you.allowed.includes(p.key) ? "mine" : "" }, h("td", { text: p.label }),
      ...t.roles.map((r) => h("td", {}, h("span", { class: p.roles[r.id] ? "yes" : "no", text: p.roles[r.id] ? "✓" : "—", "aria-label": p.roles[r.id] ? "Yes" : "No" })))));
  }
  $("roles-body").replaceChildren(...rows);
  ctx.refreshTabs?.();
}

// ---------- routing options and notification e-mails ----------
let storeSettingsData = null;

export async function loadStoreSettings() {
  const { $, h, api } = ctx;
  try {
    storeSettingsData = await api("/api/dealership/settings");
  } catch {
    $("notify-panel").hidden = true;
    $("route-options").hidden = true;
    return;
  }
  const s = storeSettingsData;
  $("route-mode").value = s.routing.mode;
  $("route-managers").checked = s.routing.managers;
  for (const el of [$("route-mode"), $("route-managers")]) el.disabled = !s.canEdit;
  $("notify-panel").hidden = false;
  const form = $("notify-form");
  form.elements.emails.value = s.notify.emails.join(", ");
  $("notify-events").replaceChildren(...s.events.map((e) => h("label", { class: "check-line" },
    h("input", { type: "checkbox", name: e.id, ...(s.notify[e.id] ? { checked: true } : {}), ...(s.canEdit ? {} : { disabled: true }) }), h("span", { text: e.label }))));
  form.elements.emails.disabled = !s.canEdit;
  $("notify-save").hidden = !s.canEdit;
  ctx.refreshTabs?.();
}

async function saveRouting() {
  if (!storeSettingsData?.canEdit) return;
  await ctx.api("/api/dealership/settings", { method: "POST", body: { routing: { enabled: ctx.$("route-chats").checked, mode: ctx.$("route-mode").value, managers: ctx.$("route-managers").checked } } });
}

async function saveNotify(event) {
  event.preventDefault();
  const { api, toast } = ctx;
  showErr("notify-error", "");
  const fd = new FormData(event.currentTarget);
  const body = { notify: { emails: String(fd.get("emails") || ""), ...Object.fromEntries(storeSettingsData.events.map((e) => [e.id, fd.get(e.id) === "on"])) } };
  try {
    storeSettingsData = { ...storeSettingsData, ...await api("/api/dealership/settings", { method: "POST", body }) };
    toast("Notifications saved", "success");
  } catch (error) {
    showErr("notify-error", error.message);
  }
}

// ---------- Settings → AutoPulse site → App web address (AutoPulse admins) ----------
async function loadAppAddress() {
  const { $, api } = ctx;
  let a;
  try {
    a = await api("/api/admin/app-address");
  } catch {
    return;
  }
  $("app-address-form").elements.address.value = a.current === a.fromEnv ? "" : a.current;
  $("app-address-hint").textContent = `In use now: ${a.current || "(not set)"}${a.current === a.fromEnv ? " (the server's default)" : ""}`;
}

async function saveAppAddress(event) {
  event.preventDefault();
  const { api, toast } = ctx;
  showErr("app-address-error", "");
  const address = String(new FormData(event.currentTarget).get("address") || "").trim();
  try {
    await api("/api/admin/app-address", { method: "POST", body: { address } });
    toast(address ? "Address checked and saved" : "Back to the server's default address", "success");
    loadAppAddress();
  } catch (error) {
    showErr("app-address-error", error.message);
  }
}

// ---------- Pages page → Dealership page and My page ----------
let storePageData = null;

function paintLink(openId, copyId, hintId, url, offText) {
  const { $ } = ctx;
  $(openId).hidden = !url;
  $(copyId).hidden = !url;
  if (url) $(openId).href = url;
  $(hintId).textContent = url ? `Link: ${url}` : offText;
}

export async function loadStorePage() {
  const { $, h, api } = ctx;
  try {
    storePageData = await api("/api/store-page");
  } catch {
    $("store-page-panel").hidden = true;
    return;
  }
  $("store-page-panel").hidden = false;
  const { page, departments, canEdit } = storePageData;
  const form = $("store-page-form");
  form.elements.visibility.value = page.visibility;
  form.elements.slug.value = page.slug || "";
  form.elements.intro.value = page.intro || "";
  form.elements.showTeam.checked = page.showTeam !== false;
  $("store-page-depts").replaceChildren(...departments.map((d) => h("div", { class: "row" },
    h("span", { text: d.label }),
    h("input", { name: `phone-${d.id}`, placeholder: "Phone", maxlength: "30", value: page.contacts?.[d.id]?.phone || "", inputmode: "tel" }),
    h("input", { name: `email-${d.id}`, placeholder: "E-mail", maxlength: "120", value: page.contacts?.[d.id]?.email || "", type: "email" }))));
  for (const el of form.elements) if (el.name) el.disabled = !canEdit;
  $("store-page-save").hidden = !canEdit;
  $("store-page-newkey").hidden = !canEdit || page.visibility !== "private";
  paintLink("store-page-open", "store-page-copy", "store-page-link", storePageData.url, "The page is off. Pick Private link or Public and Save.");
}

async function saveStorePage(newKey) {
  const { $, api, toast, confirmDialog } = ctx;
  showErr("store-page-error", "");
  if (newKey && !await confirmDialog({ title: "Make a new private link?", text: "The old link (and its QR code) stop working. Share the new one.", okLabel: "New link" })) return;
  const fd = new FormData($("store-page-form"));
  const contacts = Object.fromEntries((storePageData?.departments || []).map((d) => [d.id, { phone: String(fd.get(`phone-${d.id}`) || "").trim(), email: String(fd.get(`email-${d.id}`) || "").trim() }]));
  try {
    await api("/api/store-page", { method: "POST", body: { visibility: fd.get("visibility"), slug: String(fd.get("slug") || "").trim(), intro: String(fd.get("intro") || ""), showTeam: fd.get("showTeam") === "on", contacts, newKey } });
    toast(newKey ? "New private link made" : "Dealership page saved", "success");
    loadStorePage();
    loadMyPage();
  } catch (error) {
    showErr("store-page-error", error.message);
  }
}

export async function loadMyPage() {
  const { $, api } = ctx;
  let data;
  try {
    data = await api("/api/my-page");
  } catch {
    $("my-page-panel").hidden = true;
    return;
  }
  $("my-page-panel").hidden = false;
  const rail = document.querySelector('.rail-btn[data-view="pages"]');
  if (rail) rail.hidden = false;
  const form = $("my-page-form");
  form.elements.visibility.value = data.page.visibility;
  form.elements.bio.value = data.page.bio || "";
  const note = !data.storeVisible ? "Your page opens once the dealership page is on (Pages → Dealership page)."
    : "Your page is off. Pick Private link or Public and Save.";
  paintLink("my-page-open", "my-page-copy", "my-page-link", data.storeVisible ? data.url : "", note);
  if (data.page.code && data.url && data.storeVisible) $("my-page-link").textContent += ` · Your code: ${data.page.code}`;
}

async function saveMyPage(event) {
  event.preventDefault();
  const { api, toast } = ctx;
  showErr("my-page-error", "");
  const fd = new FormData(event.currentTarget);
  try {
    await api("/api/my-page", { method: "POST", body: { visibility: fd.get("visibility"), bio: String(fd.get("bio") || "") } });
    toast("Your page is saved", "success");
    loadMyPage();
  } catch (error) {
    showErr("my-page-error", error.message);
  }
}

// ---------- Store page → What the AI knows (inbox-only stores) ----------
export async function loadAiProfile() {
  const { $, api } = ctx;
  let p;
  try {
    p = await api("/api/dealership/ai-profile");
  } catch {
    $("ai-profile-panel").hidden = true;
    return;
  }
  $("ai-profile-panel").hidden = false;
  const form = $("ai-profile-form");
  for (const k of ["inventory", "credit", "trade", "website"]) form.elements[k].value = p.links[k] || "";
  form.elements.about.value = p.about || "";
  for (const el of form.elements) if (el.name) el.disabled = !p.canEdit;
  $("ai-profile-save").hidden = !p.canEdit;
  $("ai-profile-preview").textContent = p.preview || "";
}

async function saveAiProfile(event) {
  event.preventDefault();
  const { $, api, toast } = ctx;
  showErr("ai-profile-error", "");
  const fd = new FormData(event.currentTarget);
  const body = { links: Object.fromEntries(["inventory", "credit", "trade", "website"].map((k) => [k, String(fd.get(k) || "").trim()])), about: String(fd.get("about") || "") };
  try {
    const saved = await api("/api/dealership/ai-profile", { method: "POST", body });
    $("ai-profile-preview").textContent = saved.preview || "";
    toast("Saved. The AI uses these details from the next message.", "success");
  } catch (error) {
    showErr("ai-profile-error", error.message);
  }
}

const deptLabel = (id) => data?.departments.find((d) => d.id === id)?.label || id;
const storeName = (id) => data?.stores.find((s) => s.id === id)?.name || `Store ${id}`;

function showErr(id, message) {
  const node = ctx.$(id);
  node.textContent = message || "";
  node.hidden = !message;
}

export async function loadTeam() {
  const { $, api } = ctx;
  try {
    data = await api("/api/team");
  } catch {
    data = null; // CRM accounts: the team lives in AutoPulse CRM
  }
  $("team-panel").hidden = !data;
  $("departments-panel").hidden = !data;
  // The Team page (menu) is for dealerships whose team is managed here.
  const rail = document.querySelector('.rail-btn[data-view="staff"]');
  if (rail) rail.hidden = !data;
  ctx.refreshTabs?.();
  if (!data) return;
  // AutoPulse CRM dealer: people come from the CRM (added / removed there); Connect keeps role, departments, on/off.
  let note = document.getElementById("team-crm-note");
  if (!note) { note = ctx.h("p", { id: "team-crm-note", class: "callout" }); $("team-panel").querySelector(".records-table, table")?.before(note); }
  note.hidden = !data.crm;
  const intro = $("team-intro");
  if (intro) {
    intro.dataset.connect ||= intro.textContent;
    intro.textContent = data.crm ? "Everyone who answers this dealership's chats, from AutoPulse CRM." : intro.dataset.connect;
  }
  if (data.crm) {
    note.textContent = `This team comes from AutoPulse CRM: people are added and removed there, and sign in with their AutoPulse CRM login. Here you can set their Connect role and departments, or turn someone off in Connect only.${data.syncedAt ? ` Last updated from the CRM ${ago(data.syncedAt).toLowerCase()}.` : ""}`;
    $("team-add-btn").hidden = true;
    paintTeam();
    paintDepartments();
    loadRoles();
    return;
  }
  $("team-add-btn").hidden = !data.you.canManage;
  // Store controls: AutoPulse switched team invites off for this store.
  const invitesOff = (document.body.dataset.featuresOff || "").split(" ").includes("invites");
  $("team-add-btn").disabled = invitesOff;
  if (invitesOff) $("team-add-btn").dataset.tip = "Adding team members is switched off for this dealership by AutoPulse. Please contact AutoPulse.";
  else delete $("team-add-btn").dataset.tip;
  paintTeam();
  paintDepartments();
  loadRoles();
}

function ago(ts) {
  if (!ts) return "Never";
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function statusOf(m) {
  if (m.removedInCrm) return ["Removed in AutoPulse CRM", "promo"];
  if (m.disabled) return ["Turned off", "promo"];
  if (m.invited) return ["Invite sent", "unreplied"];
  if (m.mustChangePassword) return ["Temporary password", "human"];
  return ["Active", "known"];
}

/** Can the signed-in person change this row? Owners/admins: everyone but the owner row; managers: agents. */
function mayChange(m) {
  if (!data.you.canManage || m.role === "owner" || m.id === data.you.id) return false;
  return data.you.role !== "manager" || m.role === "agent";
}

function paintTeam() {
  const { $, h } = ctx;
  const chips = (items) => (items.length ? h("div", { class: "chips" }, ...items.map((t) => h("span", { class: "tag", text: t }))) : h("span", { class: "muted", text: "—" }));
  $("team-body").replaceChildren(...data.team.map((m) => {
    const [status, tone] = statusOf(m);
    const acts = [];
    if (mayChange(m) && data.crm) {
      // CRM team: Connect role / departments, and on / off in Connect only.
      if (!m.removedInCrm) {
        acts.push(h("button", { type: "button", class: "btn btn-sm", text: "Edit", onclick: () => openMember(m) }));
        acts.push(h("button", { type: "button", class: "btn btn-sm", text: m.disabled ? "Turn on" : "Turn off", onclick: () => rowAction(m, "toggle") }));
      }
    } else if (mayChange(m)) {
      acts.push(h("button", { type: "button", class: "btn btn-sm", text: "Edit", onclick: () => openMember(m) }));
      const more = h("select", { class: "btn btn-sm", "aria-label": `More for ${m.name}` },
        h("option", { value: "", text: "More…" }),
        h("option", { value: "password", text: "New temporary password" }),
        m.invited ? h("option", { value: "invite", text: "Resend invite e-mail" }) : null,
        h("option", { value: "toggle", text: m.disabled ? "Turn on" : "Turn off" }),
        h("option", { value: "remove", text: "Remove from team" }));
      more.addEventListener("change", () => { const v = more.value; more.value = ""; rowAction(m, v); });
      acts.push(more);
    }
    return h("tr", {},
      h("td", {}, h("div", { class: "who" }, h("strong", { text: m.name + (m.id === data.you.id ? " (you)" : "") }), h("small", { text: [m.title, m.email].filter(Boolean).join(" · ") }))),
      h("td", {}, h("span", { class: `tag role-${m.role}`, text: ROLE_LABEL[m.role], "data-tip": m.roleSetInConnect ? "Set in Connect (overrides the AutoPulse CRM role)" : m.source === "crm" ? "From the AutoPulse CRM role's permissions" : "" }),
        m.crmRole ? h("small", { class: "crm-role", text: `CRM: ${m.crmRole}`, "data-tip": "This person's role in AutoPulse CRM" }) : null),
      h("td", {}, m.role === "owner" ? h("span", { class: "muted", text: "All" }) : chips(m.departments.map(deptLabel))),
      h("td", {}, m.role === "owner" ? h("span", { class: "muted", text: "All" }) : chips((m.stores || []).map(storeName))),
      h("td", {}, h("span", { class: `tag ${tone}`, text: status })),
      h("td", { class: "muted", text: ago(m.lastLoginAt) }),
      h("td", {}, h("div", { class: "row-acts" }, ...acts)));
  }));
}

function checks(node, items, chosen, name) {
  const { h } = ctx;
  node.replaceChildren(...items.map((item) => h("label", { class: "check" },
    h("input", { type: "checkbox", name, value: String(item.id), ...(chosen.includes(item.id) ? { checked: true } : {}) }), item.label || item.name)));
}

function paintMethod() {
  const { $ } = ctx;
  const method = $("member-form").querySelector("[name=method]:checked")?.value;
  $("member-password-field").hidden = method !== "temp";
}

function openMember(member) {
  const { $ } = ctx;
  editing = member;
  const form = $("member-form");
  form.reset();
  showErr("member-error", "");
  $("member-title").textContent = member ? `Edit ${member.name}` : "Add person";
  $("member-submit").textContent = member ? "Save" : "Add person";
  for (const key of ["name", "email", "phone", "title"]) {
    form.elements[key].value = member?.[key] || "";
    // CRM people: name, e-mail and phone come from AutoPulse CRM.
    form.elements[key].disabled = Boolean(data.crm);
  }
  const roleSel = $("member-role");
  for (const opt of roleSel.options) opt.hidden = !data.roles.includes(opt.value);
  roleSel.value = member?.role && data.roles.includes(member.role) ? member.role : "agent";
  const offered = data.departments.filter((d) => data.storeDepartments.includes(d.id) || member?.departments.includes(d.id));
  checks($("member-departments"), offered, member?.departments || [], "departments");
  checks($("member-stores"), data.stores, member?.stores || (data.stores.length === 1 ? [data.stores[0].id] : []), "stores");
  // CRM person with Connect-only changes: one click back to what AutoPulse CRM says.
  let reset = document.getElementById("member-crm-reset");
  if (!reset) {
    reset = ctx.h("button", { type: "button", id: "member-crm-reset", class: "btn", text: "Use AutoPulse CRM settings" });
    reset.addEventListener("click", resetToCrm);
    $("member-submit").before(reset);
  }
  reset.hidden = !(data.crm && member && (member.roleSetInConnect || member.departmentsSetInConnect));
  reset.dataset.tip = "Role and departments go back to what AutoPulse CRM says";
  $("member-stores-set").hidden = Boolean(data.crm) || (data.stores.length < 2 && !member);
  $("member-access-set").hidden = Boolean(member) || Boolean(data.crm);
  paintMethod();
  $("member-dialog").showModal();
}

function showSecret(title, text, value) {
  const { $ } = ctx;
  $("secret-title").textContent = title;
  $("secret-text").textContent = text;
  $("secret-value").textContent = value;
  $("secret-dialog").showModal();
}

async function saveMember(event) {
  event.preventDefault();
  const { $, api, toast } = ctx;
  const form = event.currentTarget;
  showErr("member-error", "");
  const fd = new FormData(form);
  const body = {
    name: String(fd.get("name") || "").trim(), email: String(fd.get("email") || "").trim(), phone: String(fd.get("phone") || "").trim(),
    title: String(fd.get("title") || "").trim(), role: fd.get("role"),
    departments: fd.getAll("departments"), stores: fd.getAll("stores").map(Number),
  };
  if (!body.stores.length && data.stores.length === 1) body.stores = [data.stores[0].id];
  try {
    if (editing && data.crm) {
      // CRM people: only the Connect role and departments are set here.
      await api(`/api/team/${editing.id}`, { method: "PATCH", body: { role: body.role, departments: body.departments } });
      $("member-dialog").close();
      toast("Saved in Connect (AutoPulse CRM is not changed)", "success");
    } else if (editing) {
      await api(`/api/team/${editing.id}`, { method: "PATCH", body });
      $("member-dialog").close();
      toast("Saved", "success");
    } else {
      const result = await api("/api/team", { method: "POST", body: { ...body, method: fd.get("method"), password: String(fd.get("password") || "") } });
      $("member-dialog").close();
      if (result.temporaryPassword) {
        showSecret("Temporary password", `${result.member.name} signs in with ${result.member.email} and this password, then chooses their own.`, result.temporaryPassword);
      } else {
        toast(`Invite e-mailed to ${result.member.email}`, "success");
      }
    }
    loadTeam();
  } catch (error) {
    showErr("member-error", error.message);
  }
}

async function resetToCrm() {
  const { $, api, toast } = ctx;
  if (!editing) return;
  try {
    await api(`/api/team/${editing.id}`, { method: "PATCH", body: { role: null, departments: null } });
    $("member-dialog").close();
    toast(`${editing.name} follows AutoPulse CRM again`, "success");
    loadTeam();
  } catch (error) {
    showErr("member-error", error.message);
  }
}

async function rowAction(m, action) {
  const { api, toast, confirmDialog } = ctx;
  try {
    if (action === "password") {
      if (!await confirmDialog({ title: "New temporary password", text: `${m.name} is signed out and must use the new password, then choose their own.`, okLabel: "Make new password" })) return;
      const result = await api(`/api/team/${m.id}/password`, { method: "POST", body: {} });
      showSecret("New temporary password", `${m.name} signs in with ${m.email} and this password.`, result.temporaryPassword);
    } else if (action === "invite") {
      await api(`/api/team/${m.id}/invite`, { method: "POST", body: {} });
      toast(`Invite e-mailed again to ${m.email}`, "success");
    } else if (action === "toggle") {
      if (!m.disabled && !await confirmDialog({ title: `Turn off ${m.name}?`, text: data.crm
        ? "They are signed out of AutoPulse Connect and can't sign in to it until turned on again. Chats they hold go back to the team. Nothing changes in AutoPulse CRM."
        : "They are signed out and cannot sign in until turned on again. Chats they hold go back to the team.", okLabel: "Turn off" })) return;
      await api(`/api/team/${m.id}`, { method: "PATCH", body: { disabled: !m.disabled } });
      toast(m.disabled ? `${m.name} is on again` : `${m.name} is turned off`, "success");
    } else if (action === "remove") {
      if (!await confirmDialog({ title: `Remove ${m.name}?`, text: "Their account is deleted and chats they hold go back to the team. Their messages stay in the chats.", okLabel: "Remove" })) return;
      await api(`/api/team/${m.id}`, { method: "DELETE" });
      toast(`${m.name} removed`, "success");
    } else return;
    loadTeam();
  } catch (error) {
    toast(error.message, "error");
  }
}

function paintDepartments() {
  const { $ } = ctx;
  checks($("departments-checks"), data.departments, data.storeDepartments, "enabled");
  const can = data.you.canManage;
  // CRM dealer: each person's departments come from AutoPulse CRM; only chat routing is set here.
  for (const input of $("departments-checks").querySelectorAll("input")) input.disabled = !can || Boolean(data.crm);
  $("route-chats").checked = data.routeChats !== false;
  $("route-chats").disabled = !can;
  $("departments-save").hidden = !can;
}

async function saveDepartments(event) {
  event.preventDefault();
  const { api, toast } = ctx;
  showErr("departments-error", "");
  const enabled = new FormData(event.currentTarget).getAll("enabled");
  try {
    const res = await api("/api/dealership/departments", { method: "POST", body: { enabled, routeChats: ctx.$("route-chats").checked } });
    data.routeChats = res.routeChats;
    if (data.crm) { toast(res.routeChats ? "New chats are routed to the team" : "New chats wait in the queue", "success"); return; }
    await saveRouting();
    data.storeDepartments = res.enabled;
    toast("Departments saved. The website chat shows them from the next visit.", "success");
  } catch (error) {
    showErr("departments-error", error.message);
  }
}
