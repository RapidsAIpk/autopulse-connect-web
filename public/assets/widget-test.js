// Loads the chat widget on the QA test page, the same way a dealer's site does.
(function () {
  const id = new URLSearchParams(location.search).get("id") || "";
  if (!/^[a-f0-9]{24}$/.test(id)) { document.getElementById("missing").hidden = false; return; }
  const src = `${location.origin}/widget.js?id=${id}`;
  document.getElementById("embed").textContent = `<script src="${src}" async></script>`;
  const s = document.createElement("script");
  s.src = `${src}&fresh=${Date.now()}`; // the QA page always loads the newest widget
  s.async = true;
  document.body.append(s);
})();
