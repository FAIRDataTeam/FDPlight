import { RECORD_MESSAGES_EN } from '@fairdatateam/record-core/i18n';
import { LOCALES, messages } from '..';

/** Dotted key → string for every leaf of a catalog. */
function leaves(o: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of leaves(v, key)) out.set(kk, vv);
  }
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('message catalogs (TASKS Phase 8)', () => {
  const en = leaves(messages.en);

  it('English has every key the form renderer uses, with its default text', () => {
    for (const [k, v] of Object.entries(RECORD_MESSAGES_EN)) expect([k, en.get(k)]).toEqual([k, v]);
  });

  it.each(LOCALES.map((l) => l.code).filter((c) => c !== 'en'))('%s translates every key, with the same placeholders', (code) => {
    const loc = leaves(messages[code]);
    expect([...loc.keys()].filter((k) => !en.has(k))).toEqual([]);
    expect([...en.keys()].filter((k) => !loc.has(k))).toEqual([]);
    for (const [k, v] of en) expect([k, placeholders(loc.get(k)!)]).toEqual([k, placeholders(v)]);
  });
});
