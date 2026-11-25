// Dealership / staff / customer pages: copy and share links, open the website chat, and (staff view) make the
// customer's own private link. Nothing here sends a message to anyone.
(() => {
  const flash = (button, text) => {
    const before = button.textContent;
    button.textContent = text;
    setTimeout(() => { button.textContent = before; }, 1600);
  };
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {
      const area = Object.assign(document.createElement("textarea"), { value: text });
      area.style.position = "fixed"; area.style.left = "-9999px";
      document.body.append(area); area.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      area.remove();
      return ok;
    }
  }
  for (const b of document.querySelectorAll("[data-share]")) if (navigator.share) b.hidden = false;
  document.addEventListener("click", async (event) => {
    const el = event.target.closest("[data-copy], [data-share], [data-open-chat], [data-customer-link]");
    if (!el) return;
    if (el.dataset.copy !== undefined) { flash(el, (await copy(el.dataset.copy)) ? "Copied ✓" : "Copy failed"); return; }
    if (el.dataset.share !== undefined) { try { await navigator.share({ title: el.dataset.title || document.title, url: el.dataset.share }); } catch { /* cancelled */ } return; }
    if (el.dataset.openChat !== undefined) {
      event.preventDefault();
      if (window.AutoPulseChat?.open) window.AutoPulseChat.open();
      else (window.__autopulseQueue = window.__autopulseQueue || []).push({ open: true });
      return;
    }
    if (el.dataset.customerLink !== undefined) {
      const note = document.getElementById("customer-link-note");
      try {
        const res = await fetch(`/api/customers/${encodeURIComponent(el.dataset.customerLink)}/link`, {
          method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-csrf-token": el.dataset.csrf }, body: "{}",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not make the link");
        await copy(data.url);
        flash(el, "Link copied ✓");
        if (note) { note.hidden = false; note.textContent = `Copied: ${data.url} — paste it into your chat with the customer. It works for 30 days.`; }
      } catch (error) {
        if (note) { note.hidden = false; note.textContent = error.message; }
      }
    }
  });
})();
