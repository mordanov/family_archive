import { useTranslation } from 'react-i18next'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()

  return (
    <div className="segmented">
      <button
        onClick={() => i18n.changeLanguage('en')}
        data-active={i18n.language.startsWith('en')}
        title="English"
      >
        EN
      </button>
      <button
        onClick={() => i18n.changeLanguage('ru')}
        data-active={i18n.language.startsWith('ru')}
        title="Русский"
      >
        РУ
      </button>
    </div>
  )
}

