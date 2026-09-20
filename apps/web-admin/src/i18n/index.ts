import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import lo from './locales/lo.json';

export const SUPPORTED_LNGS = ['lo', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LNGS)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      lo: { translation: lo },
      en: { translation: en },
    },
    fallbackLng: 'lo',
    supportedLngs: [...SUPPORTED_LNGS],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'aura.lng',
      caches: ['localStorage'],
    },
  });

// Keep <html lang> in sync for a11y (design.md §10) and Lao line-height rules.
i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
  }
});

export default i18n;
