// Back from Facebook (Connect Facebook Page): continue to Settings from our own page, so the sign-in cookie is sent.
const link = document.getElementById("fb-return");
if (link) location.replace(link.getAttribute("href"));
