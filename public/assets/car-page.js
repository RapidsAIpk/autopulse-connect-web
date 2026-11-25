// Public car page: photo switcher and counting taps on Call / Text / WhatsApp.
(() => {
  const main = document.querySelector(".gallery-main");
  for (const thumb of document.querySelectorAll(".thumb")) {
    thumb.addEventListener("click", () => { if (main) main.src = thumb.dataset.src; });
  }
  const car = document.querySelector("main.car[data-vin]");
  if (!car) return;
  for (const link of document.querySelectorAll("[data-track]")) {
    link.addEventListener("click", () => {
      const body = JSON.stringify({ host: car.dataset.host, vin: car.dataset.vin, type: link.dataset.track });
      try {
        if (navigator.sendBeacon) navigator.sendBeacon("/api/public/car-event", new Blob([body], { type: "application/json" }));
        else fetch("/api/public/car-event", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
      } catch {}
    });
  }
})();
