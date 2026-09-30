self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      const existingClient = windowClients.find(client => new URL(client.url).pathname === "/dashboard");
      if (existingClient) return existingClient.focus();
      return self.clients.openWindow(targetUrl);
    }),
  );
});
