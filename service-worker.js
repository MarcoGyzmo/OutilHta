/* KIT HT — service worker
   Rôle : rendre l'application utilisable SANS RÉSEAU (poste enterré, sous-sol, zone blanche).
   Stratégie : "cache d'abord" sur la coquille de l'application, mise à jour en arrière-plan.
   Les appels vers Supabase (base partagée) ne sont jamais mis en cache : ils doivent rester
   temps réel, et l'application gère elle-même le mode hors ligne pour ces données. */

const VERSION = 'kitht-v21';
const COQUILLE = [
  './',
  './index.html',
  './manifest.webmanifest'
];

// --- installation : on met la coquille en cache ---
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(COQUILLE))
      .then(() => self.skipWaiting())
  );
});

// --- activation : on supprime les anciennes versions ---
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(cles => Promise.all(cles.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// --- interception des requêtes ---
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // la base partagée n'est jamais mise en cache
  if (url.hostname.endsWith('supabase.co')) return;

  // uniquement les GET de même origine
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(reponse => {
      // mise à jour silencieuse en arrière-plan
      const reseau = fetch(e.request).then(r => {
        if (r && r.status === 200) {
          const copie = r.clone();
          caches.open(VERSION).then(c => c.put(e.request, copie));
        }
        return r;
      }).catch(() => null);

      // hors ligne : on sert le cache ; à défaut la page d'accueil
      return reponse || reseau.then(r => r || caches.match('./index.html'));
    })
  );
});
