// Supported interface languages. Kept free of imports so prefs.ts can use the type.

export const LANGS = ['en', 'de', 'fr', 'es', 'it'] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
};

/** Browser language → supported UI language (English when unknown). */
export function detectLang(): Lang {
  const code = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2).toLowerCase();
  return (LANGS as readonly string[]).includes(code) ? (code as Lang) : 'en';
}
