self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  event.waitUntil((async () => {
    let payload = {};

    if (event.data) {
      try {
        payload = event.data.json();
      } catch (e) {
        payload = { body: event.data.text() };
      }
    }

    const title = payload.title || "MakanX";

    const options = {
      body: payload.body || "Order update",
      icon: payload.icon || "/icons/icon-192.png",
      badge: payload.badge || "/icons/icon-192.png",
      requireInteraction: true,
      vibrate: [200, 100, 200],
      tag: payload.tag || "makanx-order",
      data: {
        url: payload.url || "/",
      },
    };

    await self.registration.showNotification(title, options);
  })());
});


self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const url = event.notification?.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
