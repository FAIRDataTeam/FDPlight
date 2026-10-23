import { CORE_MESSAGES, coreMessageOf, say, translateCore, type CoreKey } from '../messages';

describe('core messages (TASKS Phase 8)', () => {
  it('builds the English text and remembers how it was built', () => {
    const text = say('exists', { path: 'catalog/a.ttl' });
    expect(text).toBe('catalog/a.ttl already exists');
    expect(coreMessageOf(text)).toEqual({ key: 'exists', params: { path: 'catalog/a.ttl' } });
    expect(coreMessageOf('catalog/b.ttl already exists')).toBeUndefined();
  });

  it('translates by key, nested messages first, and leaves other text alone', () => {
    const fake = (key: string, params: Record<string, string | number>) => `${key}(${Object.values(params).join('|')})`;
    expect(translateCore(say('baseUri', { problem: say('mustHttps') }), fake)).toBe('core.baseUri(core.mustHttps())');
    expect(translateCore('some GitHub error', fake)).toBe('some GitHub error');
  });

  it('has a template for every key, with only {word} placeholders', () => {
    for (const [k, v] of Object.entries(CORE_MESSAGES)) {
      expect(v.replace(/\{\w+\}/g, '').includes('{'), k).toBe(false);
      const params = Object.fromEntries([...v.matchAll(/\{(\w+)\}/g)].map((m) => [m[1], `<${m[1]}>`]));
      expect(coreMessageOf(say(k as CoreKey, params))?.key).toBe(k);
    }
  });
});
