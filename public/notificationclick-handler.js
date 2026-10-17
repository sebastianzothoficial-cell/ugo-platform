// Shared by the Workbox worker (workbox.importScripts) and public/push-sw.js so a notification tap
// navigates no matter which of the two workers is active for the scope. Only a listener lives here:
// the Workbox worker installs/activates itself, so a second install/activate handler would clash.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "./", self.location).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ("focus" in client) { client.focus(); client.navigate(targetUrl); return }
      }
      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    })
  );
});
