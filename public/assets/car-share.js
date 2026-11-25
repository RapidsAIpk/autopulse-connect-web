// Car cards on the public pages ("Explore all cars" and the car page): Share, Copy details, and Send to the chat bot.
// A card is any element with data-car (data-title, data-price, data-miles, data-meta, data-vin, data-url, data-dealer).
(() => {
  const textOf = (card, { withUrl = true } = {}) => {
    const d = card.dataset;
    return [
      d.title,
      [d.price, d.miles, d.meta].filter(Boolean).join(" · "),
      d.vin ? `VIN ${d.vin}` : "",
      d.dealer ? `At ${d.dealer}` : "",
      withUrl ? d.url : "",
    ].filter(Boolean).join("\n");
  };

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.className = "share-offscreen";
      document.body.append(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      area.remove();
      return ok;
    }
  }

  function flash(button, label) {
    const before = button.dataset.label || button.textContent;
    button.dataset.label = before;
    button.textContent = label;
    setTimeout(() => { button.textContent = button.dataset.label; }, 1600);
  }

  let menu = null;
  const closeMenu = () => { menu?.remove(); menu = null; };

  function shareMenu(card, button) {
    closeMenu();
    const d = card.dataset;
    const text = textOf(card);
    const enc = encodeURIComponent;
    const links = [
      ["WhatsApp", `https://wa.me/?text=${enc(text)}`],
      ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(d.url)}`],
      ["X", `https://twitter.com/intent/tweet?text=${enc(d.title)}&url=${enc(d.url)}`],
      ["Email", `mailto:?subject=${enc(d.title)}&body=${enc(text)}`],
      ["SMS", `sms:?&body=${enc(text)}`],
    ];
    menu = document.createElement("div");
    menu.className = "share-menu";
    menu.setAttribute("role", "menu");
    for (const [label, href] of links) {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("role", "menuitem");
      a.addEventListener("click", () => setTimeout(closeMenu, 50));
      menu.append(a);
    }
    const copyLink = document.createElement("button");
    copyLink.type = "button";
    copyLink.textContent = "Copy link";
    copyLink.addEventListener("click", async () => { await copyText(d.url); flash(copyLink, "Link copied ✓"); setTimeout(closeMenu, 900); });
    menu.append(copyLink);
    document.body.append(menu);
    const r = button.getBoundingClientRect();
    const left = Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - menu.offsetWidth - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${window.scrollY + r.bottom + 6}px`;
  }

  async function share(card, button) {
    const d = card.dataset;
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title: d.title, text: textOf(card, { withUrl: false }), url: d.url }); return; } catch { /* cancelled */ }
      return;
    }
    shareMenu(card, button);
  }

  // Send this car to the chat widget on the page (it opens the chat and asks about the car).
  function ask(card) {
    const vin = card.dataset.vin;
    if (!vin) return;
    if (window.AutoPulseChat?.ask) window.AutoPulseChat.ask([vin]);
    else (window.__autopulseQueue = window.__autopulseQueue || []).push({ ask: [vin] });
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-car-action]");
    if (!button) {
      if (menu && !event.target.closest(".share-menu")) closeMenu();
      return;
    }
    const card = button.closest("[data-car]");
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset.carAction;
    if (action === "share") share(card, button);
    else if (action === "copy") flash(button, (await copyText(textOf(card))) ? "Copied ✓" : "Copy failed");
    else if (action === "ask") ask(card);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  window.addEventListener("resize", closeMenu);
})();
