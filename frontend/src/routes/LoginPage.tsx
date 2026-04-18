import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import toast from 'react-hot-toast'

export function LoginPage() {
  const me = useQuery({ queryKey: ['me'], queryFn: authApi.me, retry: false, refetchOnWindowFocus: false })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const nav = useNavigate()
  const m = useMutation({
    mutationFn: () => authApi.login(username, password),
    onSuccess: () => nav('/', { replace: true }),
    onError: (e: Error) => toast.error(e.message || 'Login failed'),
  })

  if (me.data) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-muted p-4">
      <form
        onSubmit={(e) => { e.preventDefault(); m.mutate() }}
        className="w-full max-w-sm rounded-lg border border-surface-strong bg-surface p-6 shadow-sm"
      >
        <h1 className="mb-1 text-xl font-semibold">Family Archive</h1>
        <p className="mb-6 text-sm text-ink-muted">Sign in to your archive.</p>
        <label className="mb-3 block">
          <span className="text-sm text-ink-muted">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            className="mt-1 w-full rounded border border-surface-strong px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="mb-5 block">
          <span className="text-sm text-ink-muted">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 w-full rounded border border-surface-strong px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          disabled={m.isPending}
          className="w-full rounded bg-accent px-3 py-2 text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {m.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

