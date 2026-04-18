import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-ink-muted">{t('errors.notFoundMessage')}</p>
      <Link to="/" className="text-accent hover:underline">{t('errors.goHome')}</Link>
    </div>
  )
}

