import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-ink-muted">This page does not exist.</p>
      <Link to="/" className="text-accent hover:underline">Go home</Link>
    </div>
  )
}

