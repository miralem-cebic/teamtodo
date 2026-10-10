import { format as dfFormat, type Locale } from 'date-fns';
import { de, enUS, es, fr, it } from 'date-fns/locale';
import { usePrefs } from '../store/prefs';
import { LANGS, detectLang, type Lang } from './languages';
import { MESSAGES, type MessageKey } from './messages';

export { LANGS, LANG_NAMES, detectLang, type Lang } from './languages';
export type { MessageKey } from './messages';

const LOCALES: Record<Lang, Locale> = { en: enUS, de, fr, es, it };

/** Current UI language (stored per browser in prefs). */
export const currentLang = (): Lang => usePrefs.getState().language ?? detectLang();

/** Translate a message. `{name}` placeholders are replaced from `vars`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const idx = LANGS.indexOf(currentLang());
  let s = MESSAGES[key][idx] ?? MESSAGES[key][0];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** date-fns locale for the current UI language. */
export const dateLocale = (): Locale => LOCALES[currentLang()];

/** date-fns format() in the current UI language. */
export const fmt = (d: Date, pattern: string): string => dfFormat(d, pattern, { locale: dateLocale() });
