self.addEventListener("push", function (event) {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = {
      title: "MakanX",
      body: event.data.text()
    };
  }

  const title = payload.title || "MakanX";
  const body = payload.body || "Your order is ready!";
  const icon = payload.icon || "/icons/icon-192.png";
  const url = payload.url || "/";
  const tag = payload.tag || "makanx-order";

  const options = {
    body: body,
    icon: icon,
    badge: "/icons/icon-192.png",

    // Makes notification appear in phone notification bar
    requireInteraction: true,

    // vibration pattern
    vibrate: [200, 100, 200],

    tag: tag,

    data: {
      url: url
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});


self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const url = event.notification?.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {

        for (let client of clientList) {

          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }

          if (client.url.includes("/customer") && "navigate" in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});