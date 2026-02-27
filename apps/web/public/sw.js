self.addEventListener("push", function (event) {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    return;
  }

  const title = payload.title || "MakanX Notification";
  const body = payload.body || "";
  const icon = payload.icon || "/icons/icon-192.png";
  const url = payload.url || "/";

  const options = {
    body,
    icon,
    data: { url },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  const url = event.notification && event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : "/";
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i += 1) {
        const client = clientList[i];
        if ("focus" in client) {
          if (client.url.includes(url)) {
            return client.focus();
          }
          if (client.url.includes("/customer")) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

