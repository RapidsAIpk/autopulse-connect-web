// Loads the chat widget on the QA test page, the same way a dealer's site does.
(function () {
  const id = new URLSearchParams(location.search).get("id") || "";
  if (!/^[a-f0-9]{24}$/.test(id)) { document.getElementById("missing").hidden = false; return; }
  const src = `${location.origin}/widget.js?id=${id}`;
  document.getElementById("embed").textContent = `<script src="${src}" async></script>`;
  const s = document.createElement("script");
  // From Pop-up messages → Try it on the test page: preview the pop-ups (chat starts closed, pop-ups always play).
  const preview = new URLSearchParams(location.search).get("preview") === "popups" ? "&preview=popups" : "";
  s.src = `${src}&fresh=${Date.now()}${preview}`; // the QA page always loads the newest widget
  s.async = true;
  document.body.append(s);
})();
