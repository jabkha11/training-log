self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  const payload = event.data.json();
  const title = payload.title || "Rest complete";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "Time for your next set.",
      tag: payload.tag || "rest-timer",
      data: payload.data || {},
      icon: "/app-icon.png",
      badge: "/app-icon.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const route = event.notification.data?.route || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) {
            client.navigate(route);
          }
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(route);
      }

      return undefined;
    }),
  );
});
