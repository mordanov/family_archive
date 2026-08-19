// Service Worker для Family Archive PWA
const CACHE_NAME = 'family-archive-v3'
const PRECACHE_URLS = [
  '/favicon.svg',
  '/site.webmanifest',
]

// Install event - кеширование базовых ресурсов
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...')
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('Precache failed (offline ok):', err)
      })
    })
  )
  self.skipWaiting()
})

// Activate event - очистка старых кешей
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

// Fetch event - network-first для API и навигации, cache-first для хешированных ассетов
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Навигационные запросы (index.html) — всегда сеть, кеш только как fallback офлайн.
  // Это критично: после деплоя с новыми хешами ассетов SW не должен отдавать
  // устаревший index.html, иначе браузер получит 404 на старые *.js/*.css файлы.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(request, response.clone()))
          }
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    )
    return
  }

  // API запросы - сначала сеть
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && request.method === 'GET') {
            caches.open(CACHE_NAME).then((c) => c.put(request, response.clone()))
          }
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // Хешированные ассеты (/assets/index-*.js, /assets/index-*.css) — кеш в первую очередь.
  // Имена файлов содержат хеш содержимого, поэтому кешировать безопасно бессрочно.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type !== 'error') {
            caches.open(CACHE_NAME).then((c) => c.put(request, response.clone()))
          }
          return response
        })
        .catch(() => undefined)
    })
  )
})

