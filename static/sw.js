// Minimal service worker: makes MediaSave installable as an app.
// Everything is fetched live from your computer (no offline cache).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
