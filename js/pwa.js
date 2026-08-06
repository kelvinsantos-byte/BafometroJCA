/**
 * ============================================================
 *  PWA.JS — Registro do service worker
 * ============================================================
 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Falha ao registrar service worker:", err);
    });
  });
}
