// Runs before the stylesheet paints: pick the saved theme, else follow the system. No flash.
(function () {
  var KEY = "autopulse.theme";
  var root = document.documentElement;
  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function system() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function apply(theme) {
    root.setAttribute("data-theme", theme);
  }
  var choice = saved();
  apply(choice === "light" || choice === "dark" ? choice : system());
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () {
      var current = saved();
      if (current !== "light" && current !== "dark") apply(system());
    });
  }
  window.autopulseTheme = {
    get: function () { return root.getAttribute("data-theme") || "dark"; },
    toggle: function () {
      var next = this.get() === "light" ? "dark" : "light";
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
      return next;
    },
  };
})();
