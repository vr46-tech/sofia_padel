// src/i18n.js
import i18next from 'i18next';
import enTranslations from './locales/en.json';
import bgTranslations from './locales/bg.json';

i18next.init({
  lng: 'en', // Default language
  fallbackLng: 'en',
  resources: {
    en: { translation: enTranslations },
    bg: { translation: bgTranslations },
  },
  interpolation: {
    escapeValue: false,
  },
});

export default i18next;
