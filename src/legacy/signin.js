// Settings → AutoPulse site → LinkedIn sign-in (AutoPulse admins): the LinkedIn app's keys (kept encrypted) and an
// on/off switch. Off by default: keys alone never show the button. Turn it on only after the LinkedIn app lists the
// redirect URL shown here.
let ctx = null;

export function initSignin(deps) {
  ctx = deps;
  const { $, h, state } = ctx;
  const grid = $("settings-grid");
  if (!grid || $("linkedin-panel")) return;
  grid.append(h("div", { class: "panel pad admin-only", id: "linkedin-panel", "data-stab": "site", hidden: state.me?.role !== "admin" },
    h("h3", { text: "LinkedIn sign-in" }),
    h("div", { id: "linkedin-body", class: "stack" }, h("p", { class: "muted", text: "Loading…" }))));
}

export async function loadSignin() {
  const { $, h, api, toast, confirmDialog } = ctx;
  const panel = $("linkedin-panel");
  const body = $("linkedin-body");
  if (!panel || panel.hidden || !body) return;
  let s;
  try {
    s = await api("/api/admin/signin/linkedin");
  } catch (error) {
    body.replaceChildren(h("p", { class: "form-error", text: error.message }));
    return;
  }
  const kv = (k, v) => h("div", { class: "kv" }, h("span", { class: "muted", text: k }), v);
  const copyUrl = h("button", { type: "button", class: "btn btn-sm", text: "Copy", onclick: async () => { try { await navigator.clipboard.writeText(s.redirectUrl); toast("Redirect URL copied", "success"); } catch { toast(s.redirectUrl, "info"); } } });
  const toggle = h("button", { type: "button", class: `btn ${s.switchedOn ? "" : "btn-primary"}`, text: s.switchedOn ? "Turn off" : "Turn on", disabled: !s.hasKeys });
  toggle.addEventListener("click", async () => {
    const on = !s.switchedOn;
    if (on && !(await confirmDialog({ title: "Turn on LinkedIn sign-in?", text: `"Sign in with LinkedIn" appears on the sign-in page. It works only if the LinkedIn app lists this redirect URL:\n\n${s.redirectUrl}`, okLabel: "Turn on" }))) return;
    try { await api("/api/admin/signin/linkedin/enabled", { method: "POST", body: { enabled: on } }); toast(on ? "LinkedIn sign-in is on" : "LinkedIn sign-in is off", "success"); loadSignin(); } catch (error) { toast(error.message, "error"); }
  });
  const parts = [
    h("p", { class: "muted", text: "Lets people sign in with their LinkedIn account (same accounts as Google sign-in: the e-mail must match). It stays off until you turn it on." }),
    h("div", { class: "billing-kv" },
      kv("Status", h("span", { class: `tag ${s.enabled ? "known" : "tag-warn"}`, text: s.enabled ? "On" : "Off" })),
      kv("Keys", h("strong", { text: s.hasKeys ? `Client ID ${s.clientId} · secret …${s.secretEnding}${s.fromEnv ? " (server setting)" : ""}` : "Not saved" })),
      kv("Redirect URL", h("span", {}, h("code", { text: s.redirectUrl || "Set the app address first" }), " ", s.redirectUrl ? copyUrl : null))),
    h("p", { class: "hint", text: "Before turning it on: in the LinkedIn developer app (Auth tab → Authorized redirect URLs) add the redirect URL above. It follows the app address, so add the new one too when the address changes." }),
    h("div", { class: "btn-row" }, toggle),
  ];
  if (!s.fromEnv) {
    const id = h("input", { name: "clientId", autocomplete: "off", spellcheck: "false", value: s.clientId || "", placeholder: "Client ID" });
    const secret = h("input", { name: "clientSecret", type: "password", autocomplete: "off", spellcheck: "false", placeholder: s.hasKeys ? "Paste a new secret to replace it" : "Primary Client Secret" });
    const save = h("button", { type: "submit", class: "btn", text: s.hasKeys ? "Replace keys" : "Save keys" });
    const form = h("form", { id: "linkedin-form", class: "stack", novalidate: true },
      h("div", { class: "address-grid" },
        h("label", { class: "field" }, h("span", { text: "Client ID" }), id),
        h("label", { class: "field" }, h("span", { text: "Client secret" }), secret)),
      h("div", { class: "btn-row" }, save, s.hasKeys ? h("button", { type: "button", class: "btn", text: "Remove keys", onclick: async () => {
        if (!(await confirmDialog({ title: "Remove the LinkedIn keys?", text: "LinkedIn sign-in is turned off too.", okLabel: "Remove" }))) return;
        try { await api("/api/admin/signin/linkedin/keys", { method: "DELETE" }); toast("Keys removed", "success"); loadSignin(); } catch (error) { toast(error.message, "error"); }
      } }) : null));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      save.disabled = true;
      try { await api("/api/admin/signin/linkedin/keys", { method: "POST", body: { clientId: id.value.trim(), clientSecret: secret.value.trim() } }); toast("Keys saved (LinkedIn sign-in is still off)", "success"); loadSignin(); } catch (error) { toast(error.message, "error"); } finally { save.disabled = false; }
    });
    parts.push(form);
  }
  body.replaceChildren(...parts);
}
