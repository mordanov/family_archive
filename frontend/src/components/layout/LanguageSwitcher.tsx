import { useTranslation } from 'react-i18next'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()

  return (
    <div className="flex items-center gap-2 rounded border border-surface-strong text-xs">
      <button
        onClick={() => i18n.changeLanguage('en')}
        className={`px-2 py-1 ${i18n.language === 'en' ? 'bg-surface-strong' : ''}`}
        title="English"
      >
        EN
      </button>
      <button
        onClick={() => i18n.changeLanguage('ru')}
        className={`px-2 py-1 ${i18n.language === 'ru' ? 'bg-surface-strong' : ''}`}
        title="Русский"
      >
        РУ
      </button>
    </div>
  )
}

