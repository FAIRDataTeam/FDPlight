import { messages } from '../../i18n';
import { setLocale, useI18n } from '../useI18n';

describe('useI18n', () => {
  afterEach(() => setLocale('en'));

  it('translates, interpolates and pluralises; falls back to English, then to the key', () => {
    const { t, plural } = useI18n();
    expect(t('index.notYet', { url: 'https://x.test' })).toBe('Not in https://x.test yet: it is added at the first ping.');
    expect([plural('tree.problems', 1), plural('tree.problems', 3)]).toEqual(['1 problem to fix', '3 problems to fix']);
    setLocale('nl-NL');
    expect(t('app.tagline')).toBe((messages['nl-NL'] as { app: { tagline: string } }).app.tagline);
    expect(t('no.such.key')).toBe('no.such.key');
  });
});
