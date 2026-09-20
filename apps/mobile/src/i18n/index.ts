import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import lo from './locales/lo.json';

export const SUPPORTED_LANGUAGES = ['lo', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function deviceLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode;
  return code === 'en' ? 'en' : 'lo';
}

void i18n.use(initReactI18next).init({
  resources: {
    lo: { translation: lo },
    en: { translation: en },
  },
  lng: deviceLanguage(),
  fallbackLng: 'lo',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLanguage(lang: AppLanguage): void {
  void i18n.changeLanguage(lang);
}

export default i18n;
