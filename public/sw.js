// UGO Service Worker for Background Notifications & Job Offers

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'UGO · Nova Oferta de Serviço', body: 'Você recebeu uma nova solicitação de trabalho.', url: '/ugo-platform/' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: '/ugo-platform/pwa-192x192.png',
    badge: '/ugo-platform/icon.svg',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/ugo-platform/' },
    actions: [
      { action: 'open', title: 'Ver Oferta' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/ugo-platform/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('/ugo-platform/') && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
