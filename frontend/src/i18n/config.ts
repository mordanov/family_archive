import i18n from 'i18next'
import type { Resource, ResourceLanguage } from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from '@/locales/en.json'
import ru from '@/locales/ru.json'

const NS = ['common', 'auth', 'navigation', 'folder', 'file', 'upload', 'trash', 'share', 'preview', 'errors', 'backend', 'system'] as const

function withNamespaces(bundle: Record<string, unknown>): ResourceLanguage {
  const out: ResourceLanguage = { translation: bundle }
  for (const ns of NS) out[ns] = bundle[ns] ?? {}
  return out
}

const resources: Resource = {
  en: withNamespaces(en as Record<string, unknown>),
  ru: withNamespaces(ru as Record<string, unknown>),
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'ru'],
    ns: [...NS, 'translation'],
    defaultNS: 'common',
    fallbackNS: 'translation',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // React handles escaping
    },
  })

export default i18n

