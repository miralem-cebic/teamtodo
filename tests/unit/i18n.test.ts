import { afterEach, describe, expect, it } from 'vitest';
import { MESSAGES, type MessageKey } from '../../src/i18n/messages';
import { LANGS } from '../../src/i18n/languages';
import { t } from '../../src/i18n';
import { setLanguage } from '../../src/store/prefs';
import { statusLabel } from '../../src/lib/labels';

// Placeholders such as {name} must be the same in every language, otherwise a value would be lost.
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

afterEach(() => setLanguage('en'));

describe('translations', () => {
  const keys = Object.keys(MESSAGES) as MessageKey[];

  it('has a non-empty text for every language', () => {
    for (const key of keys) {
      for (const [i] of LANGS.entries()) expect(MESSAGES[key][i], key).toBeTruthy();
    }
  });

  it('keeps the placeholders of the English text in every language', () => {
    for (const key of keys) {
      const en = placeholders(MESSAGES[key][0]);
      for (const [i] of LANGS.entries()) expect(placeholders(MESSAGES[key][i]), `${key} (${LANGS[i]})`).toBe(en);
    }
  });

  it('uses the selected language', () => {
    setLanguage('de');
    expect(t('nav.myTasks')).toBe('Meine Aufgaben');
    setLanguage('fr');
    expect(t('nav.myTasks')).toBe('Mes tâches');
    setLanguage('en');
    expect(t('nav.myTasks')).toBe('My tasks');
  });

  it('fills placeholders', () => {
    setLanguage('it');
    expect(t('nav.inboxUnread', { n: 3 })).toBe('Posta in arrivo, 3 non lette');
  });

  it('follows the language for labels that are computed at runtime', () => {
    setLanguage('es');
    expect(statusLabel('doing')).toBe('En curso');
    expect(statusLabel('done')).toBe('Hecho');
  });
});
