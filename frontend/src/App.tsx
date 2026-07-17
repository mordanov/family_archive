import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api/auth'
import { AppShell } from '@/components/layout/AppShell'
import { BrowserPage } from '@/routes/BrowserPage'
import { LoginPage } from '@/routes/LoginPage'
import { TrashPage } from '@/routes/TrashPage'
import { SharePage } from '@/routes/SharePage'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { hydrateUploadsFromIDB } from '@/stores/uploadStore'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const me = useQuery({
    queryKey: ['me'],
    queryFn: authApi.me,
    retry: false,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (me.isError) nav(`/login?redirect=${encodeURIComponent(window.location.pathname)}`, { replace: true })
  }, [me.isError, nav])

  if (me.isLoading) return <div className="p-8 text-center text-ink-muted">{t('common.loading')}</div>
  if (me.isError) return null
  return <>{children}</>
}

export function App() {
  useEffect(() => { hydrateUploadsFromIDB() }, [])
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
