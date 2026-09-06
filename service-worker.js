/* KIT HT — service worker
   Rôle : rendre l'application utilisable SANS RÉSEAU (poste enterré, sous-sol, zone blanche).

   Deux stratégies, selon la nature du fichier :

   • index.html, la racine et le manifeste  →  RÉSEAU D'ABORD.
     On tente le réseau, on met la réponse en cache, et on ne sert le cache
     qu'en cas d'échec. Une mise à jour déployée est donc visible dès la
     première ouverture, sans avoir à vider quoi que ce soit.

   • tout le reste (images, polices…)       →  CACHE D'ABORD.
     Ces fichiers ne changent pas d'une version à l'autre : inutile de les
     redemander, et cela garde l'ouverture instantanée.

   Les appels vers Supabase ne sont jamais mis en cache : ils doivent rester
   temps réel, et l'application gère elle-même son mode hors ligne. */

const VERSION = 'kitht-v22';
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

// Un document est-il concerné par le réseau d'abord ?
function reseauDAbord(requete, url) {
  return requete.mode === 'navigate'
      || url.pathname.endsWith('/')
      || url.pathname.endsWith('.html')
      || url.pathname.endsWith('.webmanifest');
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // la base partagée n'est jamais mise en cache
  if (url.hostname.endsWith('supabase.co')) return;

  // uniquement les GET de même origine
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // ---------- RÉSEAU D'ABORD : la page elle-même ----------
  if (reseauDAbord(e.request, url)) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r && r.status === 200) {
            const copie = r.clone();
            caches.open(VERSION).then(c => c.put(e.request, copie));
          }
          return r;
        })
        .catch(() =>
          // hors ligne : on sert la version en cache, à défaut la page d'accueil
          caches.match(e.request).then(c => c || caches.match('./index.html'))
        )
    );
    return;
  }

  // ---------- CACHE D'ABORD : le reste ----------
  e.respondWith(
    caches.match(e.request).then(reponse => {
      const reseau = fetch(e.request).then(r => {
        if (r && r.status === 200) {
          const copie = r.clone();
          caches.open(VERSION).then(c => c.put(e.request, copie));
        }
        return r;
      }).catch(() => null);

      return reponse || reseau.then(r => r || caches.match('./index.html'));
    })
  );
});
