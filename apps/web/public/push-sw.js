/*
 * Push do No Strova. Este arquivo é importado pelo service worker gerado pelo Workbox (workbox.importScripts, em vite.config.js).
 * O servidor manda só dados (titulo, mensagem, rota, id); aqui monta a notificação do sistema e, ao tocar, abre ou foca o app
 * na tela certa. Não usa o SDK do Firebase: o FCM só entrega o evento `push` ao navegador.
 */
self.addEventListener('push', (event) => {
  let dados = {};
  try {
    const corpo = event.data ? event.data.json() : {};
    dados = corpo.data || corpo;
  } catch {
    dados = {};
  }
  const titulo = dados.titulo || 'No Strova';
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.mensagem || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-48.png',
      tag: dados.id || undefined, // o mesmo aviso nunca aparece duas vezes
      data: { rota: dados.rota || '#/notificacoes' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rota = (event.notification.data && event.notification.data.rota) || '#/notificacoes';
  const destino = new URL('/' + rota, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      const aberta = janelas.find((j) => j.url.startsWith(self.location.origin));
      if (aberta) {
        // já há uma janela do app: foca e troca só o hash, sem recarregar
        return aberta.focus().then((j) => (j && 'navigate' in j ? j.navigate(destino) : undefined));
      }
      return self.clients.openWindow(destino);
    }),
  );
});
