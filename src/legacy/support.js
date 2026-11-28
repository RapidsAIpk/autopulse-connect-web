// Help → FAQs and Support.
// FAQs: AutoPulse admins write them (text, images, video, PDF, files, links); every dealership user reads them.
// Support: dealership users send queries to AutoPulse with attachments; admins answer in the same thread and can turn
// an answered query into an FAQ (a draft, published when ready). Both render into any host element, so the
// "not subscribed" screen can show them too.
let ctx = null;
const MAX_FILES = 5;
const MAX_BYTES = 16 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt";
const STATUS = { open: "Open", answered: "Answered", closed: "Closed" };

export function initSupport(deps) {
  ctx = deps;
}

const fileUrl = (a) => `/media/files/${encodeURIComponent(a.file)}`;
const fmtWhen = (t) => {
  try { return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; }
};
const sizeText = (n) => (!n ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Text with the app's light formatting, line by line. */
function richText(text) {
  const { h, formatBubbleText } = ctx;
  const box = h("div", { class: "sup-text" });
  for (const line of String(text || "").split("\n")) box.append(line.trim() ? formatBubbleText(line) : h("p", { class: "sup-gap" }));
  return box;
}

/** One attachment: picture, video player, PDF / file card, or link card. */
export function attachmentEl(a, { onRemove } = {}) {
  const { h } = ctx;
  let el;
  if (a.kind === "image") el = h("a", { class: "att att-image", href: fileUrl(a), target: "_blank", rel: "noopener", title: a.name }, h("img", { src: fileUrl(a), alt: a.name || "Image", loading: "lazy" }));
  else if (a.kind === "video") el = h("div", { class: "att att-video" }, h("video", { src: fileUrl(a), controls: true, preload: "metadata" }), h("span", { class: "att-name", text: a.name || "Video" }));
  else if (a.kind === "link") {
    const external = /^https?:/i.test(a.url);
    el = h("a", { class: "att att-card att-link", href: a.url, target: "_blank", rel: external ? "noopener noreferrer" : "noopener" }, h("span", { class: "att-ic", text: "🔗" }), h("span", { class: "att-body" }, h("b", { text: a.name || a.url }), h("small", { text: a.url })));
  } else {
    el = h("a", { class: `att att-card att-${a.kind}`, href: fileUrl(a), target: "_blank", rel: "noopener" }, h("span", { class: "att-ic", text: a.kind === "pdf" ? "📄" : "📎" }), h("span", { class: "att-body" }, h("b", { text: a.name || "File" }), h("small", { text: [a.kind === "pdf" ? "PDF" : "File", sizeText(a.size)].filter(Boolean).join(" · ") })));
  }
  if (onRemove) {
    const wrap = h("div", { class: "att-wrap" }, el, h("button", { type: "button", class: "att-x", title: "Remove", "aria-label": "Remove attachment", text: "×", onclick: onRemove }));
    return wrap;
  }
  return el;
}

function attachments(list) {
  const { h } = ctx;
  return list?.length ? h("div", { class: "att-list" }, list.map((a) => attachmentEl(a))) : null;
}

/** New attachments for a form: pick files (several), paste images, drop files, add links. */
function attachPicker({ pasteTarget } = {}) {
  const { h, toast, confirmDialog, fileToPayload } = ctx;
  const files = [];
  const links = [];
  const chips = h("div", { class: "att-pending" });
  const input = h("input", { type: "file", multiple: true, accept: ACCEPT, hidden: true });
  const add = (list) => {
    for (const f of list) {
      if (files.length >= MAX_FILES) { toast(`Up to ${MAX_FILES} files at a time`, "warn"); break; }
      if (f.size > MAX_BYTES) { toast(`${f.name}: larger than 16 MB`, "error"); continue; }
      files.push(f);
    }
    paint();
  };
  const paint = () => {
    chips.replaceChildren(
      ...files.map((f, i) => h("span", { class: "att-chip" }, /^image\//.test(f.type) ? "🖼 " : /^video\//.test(f.type) ? "🎬 " : f.type === "application/pdf" ? "📄 " : "📎 ", f.name || "pasted image", h("small", { text: ` ${sizeText(f.size)}` }), h("button", { type: "button", "aria-label": "Remove", text: "×", onclick: () => { files.splice(i, 1); paint(); } }))),
      ...links.map((l, i) => h("span", { class: "att-chip" }, "🔗 ", l.name || l.url, h("button", { type: "button", "aria-label": "Remove", text: "×", onclick: () => { links.splice(i, 1); paint(); } }))),
    );
    chips.hidden = !files.length && !links.length;
  };
  input.addEventListener("change", () => { add([...(input.files || [])]); input.value = ""; });
  const onPaste = (e) => {
    const imgs = [...(e.clipboardData?.items || [])].filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter(Boolean);
    if (imgs.length) { e.preventDefault(); add(imgs.map((f) => (f.name && f.name !== "image.png" ? f : new File([f], `pasted-${Date.now()}.png`, { type: f.type })))); }
  };
  pasteTarget?.addEventListener("paste", onPaste);
  const bar = h("div", { class: "att-bar" },
    h("button", { type: "button", class: "btn btn-sm", onclick: () => input.click(), title: "Images, video (MP4/MOV), PDF, Word, Excel, PowerPoint, text — up to 16 MB each" }, "📎 Attach files"),
    h("button", { type: "button", class: "btn btn-sm", onclick: async () => {
      const url = await confirmDialog({ title: "Add a link", text: "Paste the address (https://…). It shows as a link card.", okLabel: "Add link", input: true, inputType: "url", placeholder: "https://…" });
      if (!url) return;
      const v = String(url).trim();
      if (!/^(https?:\/\/|\/)/i.test(v)) { toast("Use a full address that starts with https://", "error"); return; }
      links.push({ url: v, name: "" });
      paint();
    } }, "🔗 Add link"),
    h("span", { class: "att-hint muted", text: "or paste / drop images here" }),
    input);
  const el = h("div", { class: "att-picker" }, bar, chips);
  for (const target of [el, pasteTarget].filter(Boolean)) {
    target.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drag"); });
    target.addEventListener("dragleave", () => el.classList.remove("drag"));
    target.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("drag"); add([...(e.dataTransfer?.files || [])]); });
  }
  paint();
  return {
    el,
    get empty() { return !files.length && !links.length; },
    async payload() { return { files: await Promise.all(files.map(fileToPayload)), links: links.slice() }; },
    reset() { files.length = 0; links.length = 0; paint(); },
  };
}

/** A dialog built on the fly (closed with Esc, the × or Cancel). */
function sheet(title, body, { wide = false } = {}) {
  const { h } = ctx;
  const dlg = h("dialog", { class: `dialog sup-dialog${wide ? " wide" : ""}` });
  dlg.append(h("div", { class: "sup-dialog-head" }, h("h3", { text: title }), h("button", { type: "button", class: "icon-btn", "aria-label": "Close", text: "×", onclick: () => dlg.close() })), body);
  dlg.addEventListener("close", () => setTimeout(() => dlg.remove(), 50));
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

// ====================================================== FAQs ======================================================
const faqState = { list: [], canEdit: false, q: "", cat: "", host: null };

export async function mountFaqs(host) {
  faqState.host = host;
  host.replaceChildren(ctx.h("p", { class: "muted", text: "Loading…" }));
  try {
    const r = await ctx.api("/api/faqs");
    faqState.list = r.faqs || [];
    faqState.canEdit = Boolean(r.canEdit);
  } catch (e) {
    host.replaceChildren(ctx.h("p", { class: "form-error", text: e.message }));
    return;
  }
  paintFaqs();
}

function paintFaqs() {
  const { h } = ctx;
  const host = faqState.host;
  if (!host) return;
  const cats = [...new Set(faqState.list.map((f) => f.category || "General"))];
  const search = h("input", { type: "search", class: "faq-search", placeholder: "Search the FAQs…", value: faqState.q });
  search.addEventListener("input", () => { faqState.q = search.value; paintList(); });
  const chips = h("div", { class: "faq-cats" },
    h("button", { type: "button", class: `chip${!faqState.cat ? " on" : ""}`, text: `All (${faqState.list.length})`, onclick: () => { faqState.cat = ""; paintFaqs(); } }),
    cats.map((c) => h("button", { type: "button", class: `chip${faqState.cat === c ? " on" : ""}`, text: `${c} (${faqState.list.filter((f) => (f.category || "General") === c).length})`, onclick: () => { faqState.cat = c; paintFaqs(); } })));
  const listBox = h("div", { class: "faq-list" });
  const paintList = () => {
    const qq = faqState.q.toLowerCase();
    const rows = faqState.list.filter((f) => (!faqState.cat || (f.category || "General") === faqState.cat) && (!qq || `${f.title} ${f.answer} ${f.category}`.toLowerCase().includes(qq)));
    listBox.replaceChildren(...(rows.length ? rows.map(faqItem) : [h("div", { class: "empty-state", text: faqState.list.length ? "No FAQ matches your search." : "No FAQs yet." })]));
  };
  host.replaceChildren(
    h("div", { class: "faq-toolbar" }, search,
      faqState.canEdit ? h("button", { type: "button", class: "btn btn-primary", text: "+ Add FAQ", onclick: () => openFaqDialog(null) }) : null,
      h("button", { type: "button", class: "btn", text: "Ask support", title: "Can't find it? Send your question to AutoPulse", onclick: () => ctx.openSupport?.() })),
    chips, listBox);
  paintList();
}

function faqItem(f) {
  const { h, api, toast, confirmDialog } = ctx;
  const d = h("details", { class: `faq-item${f.published ? "" : " draft"}` });
  const idx = faqState.list.indexOf(f);
  const move = async (dir) => {
    const list = faqState.list.slice();
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    faqState.list = list;
    paintFaqs();
    try { await api("/api/faqs/order", { method: "POST", body: { ids: list.map((x) => x.id) } }); } catch (e) { toast(e.message, "error"); }
  };
  d.append(
    h("summary", {}, h("span", { class: "faq-q", text: f.title }), h("span", { class: "faq-cat", text: f.category || "General" }), f.published ? null : h("span", { class: "pill pill-warn", text: "Draft · hidden from dealers" }), f.attachments?.length ? h("span", { class: "faq-att-n", text: `📎 ${f.attachments.length}` }) : null),
    h("div", { class: "faq-a" }, richText(f.answer), attachments(f.attachments),
      faqState.canEdit ? h("div", { class: "faq-admin" },
        h("button", { type: "button", class: "btn btn-sm", text: "Edit", onclick: () => openFaqDialog(f) }),
        h("button", { type: "button", class: "btn btn-sm", text: f.published ? "Unpublish" : "Publish", onclick: async () => {
          try { const r = await api(`/api/faqs/${f.id}`, { method: "PATCH", body: { published: !f.published } }); Object.assign(f, r.faq); paintFaqs(); toast(f.published ? "Published: dealers see it now" : "Hidden from dealers", "success"); } catch (e) { toast(e.message, "error"); }
        } }),
        h("button", { type: "button", class: "btn btn-sm", text: "↑", title: "Move up", disabled: idx <= 0, onclick: () => move(-1) }),
        h("button", { type: "button", class: "btn btn-sm", text: "↓", title: "Move down", disabled: idx >= faqState.list.length - 1, onclick: () => move(1) }),
        h("button", { type: "button", class: "btn btn-sm btn-danger", text: "Delete", onclick: async () => {
          if (!(await confirmDialog({ title: "Delete this FAQ?", text: f.title, okLabel: "Delete" }))) return;
          try { await api(`/api/faqs/${f.id}`, { method: "DELETE" }); faqState.list = faqState.list.filter((x) => x !== f); paintFaqs(); toast("FAQ deleted", "success"); } catch (e) { toast(e.message, "error"); }
        } })) : null));
  return d;
}

/** Add or edit an FAQ (also used for a draft made from a support query). */
export function openFaqDialog(faq, { draft = null, onSaved } = {}) {
  const { h, api, toast } = ctx;
  const src = faq || draft || {};
  const kept = (src.attachments || []).slice();
  const cats = [...new Set(["General", ...faqState.list.map((f) => f.category || "General")])];
  const listId = `faq-cats-${Date.now()}`;
  const title = h("input", { name: "title", required: true, maxlength: "200", value: src.title || "", placeholder: "The question, as a dealer would ask it" });
  const category = h("input", { name: "category", maxlength: "60", value: src.category || "General", list: listId });
  const answer = h("textarea", { name: "answer", rows: "9", maxlength: "8000", placeholder: "The answer. *bold*, _italic_ and links work. Paste images straight in." });
  answer.value = src.answer || "";
  const published = h("input", { type: "checkbox", checked: faq ? Boolean(faq.published) : draft ? false : true });
  const keptBox = h("div", { class: "att-list" });
  const paintKept = () => keptBox.replaceChildren(...kept.map((a, i) => attachmentEl(a, { onRemove: () => { kept.splice(i, 1); paintKept(); } })));
  paintKept();
  const picker = attachPicker({ pasteTarget: answer });
  const err = h("p", { class: "form-error", hidden: true });
  const save = h("button", { type: "submit", class: "btn btn-primary", text: faq ? "Save FAQ" : "Add FAQ" });
  const form = h("form", { class: "stack sup-form" },
    h("label", { class: "field" }, h("span", { text: "Question" }), title),
    h("label", { class: "field" }, h("span", { text: "Category" }), category, h("datalist", { id: listId }, cats.map((c) => h("option", { value: c })))),
    h("label", { class: "field" }, h("span", { text: "Answer" }), answer),
    h("div", { class: "field" }, h("span", { text: "Attachments: images, video, PDF, files and links" }), keptBox, picker.el),
    h("label", { class: "check-row" }, published, h("span", { text: " Published (dealers see it)" })),
    err,
    h("div", { class: "row-end" }, h("button", { type: "button", class: "btn", text: "Cancel", onclick: () => dlg.close() }), save));
  const dlg = sheet(faq ? "Edit FAQ" : draft ? "New FAQ from this query" : "Add FAQ", form, { wide: true });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    save.disabled = true;
    save.textContent = "Saving…";
    try {
      const body = { title: title.value, category: category.value, answer: answer.value, published: published.checked, attachments: kept, ...(await picker.payload()) };
      if (draft?.fromTicketId) body.fromTicketId = draft.fromTicketId;
      const r = faq ? await api(`/api/faqs/${faq.id}`, { method: "PATCH", body }) : await api("/api/faqs", { method: "POST", body });
      if (faq) Object.assign(faq, r.faq);
      else faqState.list.push(r.faq);
      dlg.close();
      toast(faq ? "FAQ saved" : r.faq.published ? "FAQ added: dealers see it now" : "FAQ saved as a draft (hidden from dealers)", "success");
      paintFaqs();
      onSaved?.(r.faq);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      save.disabled = false;
      save.textContent = faq ? "Save FAQ" : "Add FAQ";
    }
  });
  title.focus();
}

// ===================================================== Support =====================================================
const sup = { host: null, list: [], stores: [], admin: false, status: "", store: "", q: "", current: null, ticket: null };

export async function mountSupport(host, { openId = null } = {}) {
  sup.host = host;
  if (openId) sup.current = Number(openId);
  const { h } = ctx;
  if (!host.querySelector(".sup-layout")) {
    host.replaceChildren(h("div", { class: "sup-layout" }, h("div", { class: "panel sup-side" }, h("div", { class: "sup-side-head" }), h("div", { class: "sup-list" })), h("div", { class: "panel sup-main" })));
  }
  await reloadTickets();
  if (sup.current) await openTicket(sup.current);
  else paintThread();
}

async function reloadTickets() {
  const { api } = ctx;
  try {
    const qs = new URLSearchParams();
    if (sup.status) qs.set("status", sup.status);
    if (sup.store) qs.set("store", sup.store);
    if (sup.q) qs.set("q", sup.q);
    const r = await api(`/api/support${qs.toString() ? `?${qs}` : ""}`);
    sup.list = r.tickets || [];
    sup.admin = Boolean(r.admin);
    if (r.stores?.length || !sup.store) sup.stores = r.stores || sup.stores;
  } catch (e) {
    sup.list = [];
    ctx.toast(e.message, "error");
  }
  paintList();
}

function paintList() {
  const { h } = ctx;
  const head = sup.host?.querySelector(".sup-side-head");
  const box = sup.host?.querySelector(".sup-list");
  if (!head || !box) return;
  const status = h("select", { "aria-label": "Status" }, [["", "All queries"], ["open", "Open"], ["answered", "Answered"], ["closed", "Closed"]].map(([v, t]) => h("option", { value: v, text: t, selected: sup.status === v })));
  status.addEventListener("change", () => { sup.status = status.value; reloadTickets(); });
  const parts = [
    sup.admin ? h("div", { class: "sup-who", text: "All dealerships' queries" }) : h("button", { type: "button", class: "btn btn-primary sup-new", text: "+ New query", onclick: openNewQuery }),
    h("div", { class: "sup-filters" }, status,
      sup.admin ? (() => {
        const s = h("select", { "aria-label": "Store" }, h("option", { value: "", text: "All stores" }), sup.stores.map((x) => h("option", { value: x.id, text: x.name, selected: sup.store === x.id })));
        s.addEventListener("change", () => { sup.store = s.value; reloadTickets(); });
        return s;
      })() : null),
    (() => {
      const q = h("input", { type: "search", placeholder: "Search queries…", value: sup.q });
      let t;
      q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { sup.q = q.value.trim(); reloadTickets(); }, 300); });
      return q;
    })(),
  ];
  head.replaceChildren(...parts.filter(Boolean));
  box.replaceChildren(...(sup.list.length ? sup.list.map((t) => h("button", { type: "button", class: `sup-row${t.id === sup.current ? " on" : ""}${t.unread ? " unread" : ""}`, onclick: () => openTicket(t.id) },
    h("span", { class: "sup-row-top" }, h("b", { class: "sup-subj", text: t.subject }), h("span", { class: `pill st-${t.status}`, text: STATUS[t.status] || t.status })),
    sup.admin ? h("span", { class: "sup-store", text: t.storeName }) : null,
    h("span", { class: "sup-last muted" }, t.last ? `${t.last.by === "admin" ? "AutoPulse: " : `${t.last.name}: `}${t.last.text || "📎 attachment"}` : ""),
    h("span", { class: "sup-when muted", text: `#${t.id} · ${fmtWhen(t.lastAt)}` }))) : [h("div", { class: "empty-state", text: sup.admin ? "No queries yet." : "No queries yet. Ask AutoPulse anything with + New query." })]));
}

async function openTicket(id) {
  sup.current = Number(id);
  try {
    const r = await ctx.api(`/api/support/${id}`);
    sup.ticket = r.ticket;
    const row = sup.list.find((t) => t.id === sup.ticket.id);
    if (row) row.unread = false;
  } catch (e) {
    ctx.toast(e.message, "error");
    sup.ticket = null;
  }
  paintList();
  paintThread();
  refreshSupportBadge();
}

function paintThread() {
  const { h, api, toast } = ctx;
  const main = sup.host?.querySelector(".sup-main");
  if (!main) return;
  const t = sup.ticket;
  if (!t) {
    main.replaceChildren(h("div", { class: "sup-empty" }, h("div", { class: "sup-empty-ic", text: "💬" }), h("b", { text: sup.admin ? "Pick a query on the left" : "Questions for AutoPulse" }), h("p", { class: "muted", text: sup.admin ? "Answer it here. When the answer would help every dealer, use Make FAQ from this." : "Open a query with + New query. Add screenshots, a video, a PDF or a link so we can help faster. Check the FAQs first: the answer may already be there." })));
    return;
  }
  const setStatus = async (status) => {
    try { const r = await api(`/api/support/${t.id}`, { method: "PATCH", body: { status } }); sup.ticket = r.ticket; await reloadTickets(); paintThread(); toast(status === "closed" ? "Query closed" : "Query reopened", "success"); } catch (e) { toast(e.message, "error"); }
  };
  const makeFaq = async () => {
    try {
      const r = await api(`/api/support/${t.id}/faq`, { method: "POST", body: {} });
      if (!faqState.list.length) await mountFaqsData();
      openFaqDialog(null, { draft: r.draft, onSaved: async () => { await openTicket(t.id); } });
    } catch (e) { toast(e.message, "error"); }
  };
  const msgs = h("div", { class: "sup-msgs" }, (t.messages || []).map((m) => {
    const mine = sup.admin ? m.by === "admin" : m.by === "dealer";
    return h("div", { class: `sup-msg ${m.by === "admin" ? "from-admin" : "from-dealer"}${mine ? " mine" : ""}` },
      h("div", { class: "sup-msg-head" }, h("b", { text: m.by === "admin" ? (m.name || "AutoPulse support") : m.name }), h("span", { class: "muted", text: fmtWhen(m.at) })),
      m.text ? richText(m.text) : null, attachments(m.attachments));
  }));
  const text = h("textarea", { rows: "4", maxlength: "8000", placeholder: t.status === "closed" ? "This query is closed. Writing here reopens it." : sup.admin ? "Write your answer… (paste screenshots straight in)" : "Write a reply… (paste screenshots straight in)" });
  const picker = attachPicker({ pasteTarget: text });
  const send = h("button", { type: "submit", class: "btn btn-primary", text: sup.admin ? "Send answer" : "Send reply" });
  const form = h("form", { class: "sup-reply" }, text, picker.el, h("div", { class: "row-end" }, send));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!text.value.trim() && picker.empty) { toast("Write a reply or attach something", "warn"); return; }
    send.disabled = true;
    send.textContent = "Sending…";
    try {
      const r = await api(`/api/support/${t.id}/reply`, { method: "POST", body: { text: text.value, ...(await picker.payload()) } });
      sup.ticket = r.ticket;
      await reloadTickets();
      paintThread();
      toast(sup.admin ? "Answer sent: the dealer is notified" : "Reply sent to AutoPulse", "success");
    } catch (ex) {
      toast(ex.message, "error");
      send.disabled = false;
      send.textContent = sup.admin ? "Send answer" : "Send reply";
    }
  });
  main.replaceChildren(
    h("div", { class: "sup-thread-head" },
      h("div", {}, h("h3", { text: t.subject }), h("div", { class: "muted sup-meta" }, `#${t.id} · `, sup.admin ? `${t.storeName} · ` : "", `opened by ${t.openedBy?.name || "—"} · ${fmtWhen(t.createdAt)}`, t.faqId ? h("span", { class: "pill pill-ok", text: "FAQ made" }) : null)),
      h("div", { class: "sup-actions" }, h("span", { class: `pill st-${t.status}`, text: STATUS[t.status] || t.status }),
        sup.admin ? h("button", { type: "button", class: "btn btn-sm", text: "★ Make FAQ from this", title: "Turn this question and your answer into an FAQ (saved as a draft first)", onclick: makeFaq }) : null,
        t.status === "closed" ? h("button", { type: "button", class: "btn btn-sm", text: "Reopen", onclick: () => setStatus("open") }) : h("button", { type: "button", class: "btn btn-sm", text: "Close query", onclick: () => setStatus("closed") }))),
    msgs, form);
  msgs.scrollTop = msgs.scrollHeight;
}

async function mountFaqsData() {
  try { const r = await ctx.api("/api/faqs"); faqState.list = r.faqs || []; faqState.canEdit = Boolean(r.canEdit); } catch {}
}

function openNewQuery() {
  const { h, api, toast } = ctx;
  const subject = h("input", { required: true, maxlength: "160", placeholder: "In a few words: what do you need?" });
  const text = h("textarea", { rows: "7", maxlength: "8000", placeholder: "Tell us more: what you tried, what you see, which car or chat… Paste screenshots straight in." });
  const picker = attachPicker({ pasteTarget: text });
  const err = h("p", { class: "form-error", hidden: true });
  const send = h("button", { type: "submit", class: "btn btn-primary", text: "Send to AutoPulse" });
  const form = h("form", { class: "stack sup-form" },
    h("label", { class: "field" }, h("span", { text: "Subject" }), subject),
    h("label", { class: "field" }, h("span", { text: "Your question" }), text),
    h("div", { class: "field" }, h("span", { text: "Screenshots, video, PDF, files or links (optional)" }), picker.el),
    err,
    h("div", { class: "row-end" }, h("button", { type: "button", class: "btn", text: "Cancel", onclick: () => dlg.close() }), send));
  const dlg = sheet("New query to AutoPulse", form, { wide: true });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    send.disabled = true;
    send.textContent = "Sending…";
    try {
      const r = await api("/api/support", { method: "POST", body: { subject: subject.value, text: text.value, ...(await picker.payload()) } });
      dlg.close();
      toast("Sent. AutoPulse will answer here and by e-mail.", "success");
      sup.current = r.ticket.id;
      await reloadTickets();
      await openTicket(r.ticket.id);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      send.disabled = false;
      send.textContent = "Send to AutoPulse";
    }
  });
  subject.focus();
}

// ===================================================== badge & live =====================================================
export async function refreshSupportBadge() {
  const badge = document.getElementById("rail-support");
  if (!badge || !ctx) return;
  try {
    const { unread } = await ctx.api("/api/support/unread");
    badge.hidden = !unread;
    badge.textContent = unread > 99 ? "99+" : String(unread);
  } catch {}
}

/** Live: a query changed (new query, reply, status). */
export function onSupportEvent(data) {
  refreshSupportBadge();
  if (sup.host?.isConnected && !sup.host.closest("[hidden]")) {
    reloadTickets();
    if (sup.current && Number(data?.id) === sup.current) openTicket(sup.current);
  }
}

/** For screens without the menu (not subscribed): FAQs / Support in a full-page overlay. */
export function openOverlay(kind) {
  const { h } = ctx;
  document.querySelector(".sup-overlay")?.remove();
  const host = h("div", { class: "sup-overlay-body" });
  const ov = h("div", { class: "sup-overlay" },
    h("div", { class: "sup-overlay-head" },
      h("div", { class: "seg" },
        h("button", { type: "button", class: kind === "faqs" ? "on" : "", text: "FAQs", onclick: () => openOverlay("faqs") }),
        h("button", { type: "button", class: kind === "support" ? "on" : "", text: "Support", onclick: () => openOverlay("support") })),
      h("button", { type: "button", class: "btn", text: "Close", onclick: () => ov.remove() })),
    host);
  document.body.append(ov);
  ctx.openSupport = () => openOverlay("support");
  if (kind === "faqs") mountFaqs(host);
  else mountSupport(host);
}
