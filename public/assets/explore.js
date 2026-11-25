// "Explore all cars": sort changes apply at once, the filter drawer starts closed on phones, broken photos get a placeholder.
(() => {
  for (const select of document.querySelectorAll("[data-autosubmit]")) {
    select.addEventListener("change", () => (select.form?.requestSubmit ? select.form.requestSubmit() : select.form?.submit()));
  }
  // Filter selects apply as soon as they change on wide screens (where the panel is always visible).
  const filters = document.getElementById("filters");
  if (filters && window.matchMedia("(min-width: 861px)").matches) {
    for (const select of filters.querySelectorAll("select")) {
      select.addEventListener("change", () => {
        const page = filters.querySelector('input[name="page"]');
        if (page) page.remove();
        if (filters.requestSubmit) filters.requestSubmit(); else filters.submit();
      });
    }
  }
  const drawer = document.getElementById("drawer");
  if (drawer && window.matchMedia("(max-width: 860px)").matches) drawer.open = false;
  // Empty fields are left out of the address, so links stay short and clean.
  for (const form of document.querySelectorAll("form[method=get]")) {
    form.addEventListener("submit", () => {
      for (const field of form.querySelectorAll("input, select")) if (!field.value) field.disabled = true;
    });
  }
  for (const img of document.querySelectorAll(".media img")) {
    img.addEventListener("error", () => {
      const box = document.createElement("div");
      box.className = "noimg";
      box.textContent = "Photo unavailable";
      img.replaceWith(box);
    }, { once: true });
  }
})();
