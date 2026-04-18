// Service Worker для Family Archive PWA
const CACHE_NAME = 'family-archive-v1'
const PRECACHE_URLS = [
  '/',
  '/index.html',
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

// Fetch event - network-first для API, cache-first для остального
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // API запросы - сначала сеть
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Кешируем успешные ответы
          if (response.ok && request.method === 'GET') {
            const cache = caches.open(CACHE_NAME)
            cache.then((c) => c.put(request, response.clone()))
          }
          return response
        })
        .catch(() => {
          // Offline - пытаемся вернуть из кеша
          return caches.match(request)
        })
    )
    return
  }

  // Статические ресурсы - кеш в первую очередь
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response
          }
          const cache = caches.open(CACHE_NAME)
          cache.then((c) => c.put(request, response.clone()))
          return response
        })
        .catch(() => {
          // Fallback для offline
          if (request.destination === 'document') {
            return caches.match('/')
          }
        })
    })
  )
})

