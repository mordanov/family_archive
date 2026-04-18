import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/routes/LoginPage'
import { BrowserPage } from '@/routes/BrowserPage'
import { TrashPage } from '@/routes/TrashPage'
import { SharePage } from '@/routes/SharePage'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { hydrateUploadsFromIDB } from '@/stores/uploadStore'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const me = useQuery({ queryKey: ['me'], queryFn: authApi.me, retry: false, refetchOnWindowFocus: false })
  if (me.isLoading) return <div className="p-8 text-center text-ink-muted">Loading…</div>
  if (me.isError) return <Navigate to="/login" replace />
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

