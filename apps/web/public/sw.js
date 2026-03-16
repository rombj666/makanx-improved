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
    const url = payload.url || "/";

    const options = {
      body: payload.body || "Order update",
      icon: payload.icon || "/images/event-map.jpg",
      badge: payload.badge || "/images/event-map.jpg",
      requireInteraction: false,
      vibrate: [200, 100, 200],
      tag: payload.tag || "makanx-order",
      renotify: true,
      data: {
        url,
        orderId: payload.orderId || null,
      },
    };

    await self.registration.showNotification(title, options);
  })());
});


self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const relativeUrl = event.notification?.data?.url || "/";
  const targetUrl = new URL(relativeUrl, self.location.origin).toString();

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const sameOriginClients = clientList.filter((c) => {
          try {
            return new URL(c.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });

        const exact = sameOriginClients.find((c) => c.url === targetUrl);
        if (exact && "focus" in exact) return exact.focus();

        const anyClient = sameOriginClients[0];
        if (anyClient && "focus" in anyClient) {
          return anyClient.focus().then(() => {
            if ("navigate" in anyClient) {
              return anyClient.navigate(targetUrl);
            }
          });
        }

        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});
