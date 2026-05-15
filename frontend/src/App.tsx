import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api/auth'
import { AppShell } from '@/components/layout/AppShell'
import { BrowserPage } from '@/routes/BrowserPage'
import { TrashPage } from '@/routes/TrashPage'
import { SharePage } from '@/routes/SharePage'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { hydrateUploadsFromIDB } from '@/stores/uploadStore'

// Read token from URL fragment on load (set by auth service after login).
// Runs synchronously at module-import time, before React renders.
;(() => {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const token = hash.get('access_token')
  if (token) {
    localStorage.setItem('access_token', token)
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
})()

function redirectToAuthService(): void {
  const authUrl = import.meta.env.VITE_AUTH_URL || 'http://localhost:3000'
  window.location.replace(
    `${authUrl}/auth/login?redirect_after=${encodeURIComponent(window.location.href)}`
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const token = localStorage.getItem('access_token')
  const me = useQuery({
    queryKey: ['me'],
    queryFn: authApi.me,
    retry: false,
    refetchOnWindowFocus: false,
    enabled: !!token,
  })

  if (!token) {
    redirectToAuthService()
    return null
  }
  if (me.isLoading) return <div className="p-8 text-center text-ink-muted">{t('common.loading')}</div>
  if (me.isError) {
    redirectToAuthService()
    return null
  }
  return <>{children}</>
}

export function App() {
  useEffect(() => { hydrateUploadsFromIDB() }, [])
  return (
    <Routes>
      <Route path="/s/:token" element={<SharePage />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Navigate to="/folder/1" replace />} />
        <Route path="/folder/:id" element={<BrowserPage />} />
        <Route path="/trash" element={<TrashPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

