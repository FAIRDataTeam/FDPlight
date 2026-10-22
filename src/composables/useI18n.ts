// Locale state and translation, the same mechanism as Contour (TASKS Phase 8).
import { ref } from 'vue';
import { LOCALES, messages, type Locale } from '../i18n';

const STORAGE_KEY = 'fdplight.locale';
const DEFAULT_LOCALE: Locale = 'en';

const SUPPORTED = LOCALES.map((l) => l.code);

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED as string[]).includes(value);
}

/**
 * Pick a supported locale for a BCP-47 browser tag: prefer an exact match
 * (case-insensitive), then fall back to the primary subtag (e.g. `nl-BE` → `nl-NL`,
 * `de-AT` → `de-DE`, `en-US` → `en`). Returns undefined if nothing matches.
 */
function matchBrowserTag(tag: string): Locale | undefined {
  const lower = tag.toLowerCase();
  const exact = SUPPORTED.find((code) => code.toLowerCase() === lower);
  if (exact) return exact;
  const primary = lower.split('-')[0];
  return SUPPORTED.find((code) => code.toLowerCase().split('-')[0] === primary);
}

function detectFromBrowser(): Locale | undefined {
  try {
    const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of prefs) {
      if (!tag) continue;
      const match = matchBrowserTag(tag);
      if (match) return match;
    }
  } catch {
    /* navigator unavailable */
  }
  return undefined;
}

function detectInitial(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* localStorage unavailable (e.g. file://, privacy mode) */
  }
  // No explicit choice yet — honour the browser's preferred language if supported,
  // otherwise fall back to English.
  return detectFromBrowser() ?? DEFAULT_LOCALE;
}

// Module-level reactive locale — shared across every component that calls useI18n().
const locale = ref<Locale>(detectInitial());

export function setLocale(next: Locale): void {
  locale.value = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}

function resolve(dict: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((obj, part) => {
    if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[part];
    return undefined;
  }, dict);
}

function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

export function useI18n() {
  /** Translate a dotted key, with English fallback and {param} interpolation. */
  function t(key: string, params?: Record<string, string | number>): string {
    let val = resolve(messages[locale.value], key);
    if (typeof val !== 'string') val = resolve(messages.en, key);
    if (typeof val !== 'string') return key;
    return interpolate(val, params);
  }

  /** Pluralize a { one, other } key by `n` (interpolates {n} plus any params). */
  function plural(key: string, n: number, params?: Record<string, string | number>): string {
    let entry = resolve(messages[locale.value], key);
    if (!entry || typeof entry !== 'object') entry = resolve(messages.en, key);
    const form = n === 1 ? 'one' : 'other';
    const tmpl =
      entry && typeof entry === 'object'
        ? (entry as Record<string, string>)[form]
        : undefined;
    if (typeof tmpl !== 'string') return key;
    return interpolate(tmpl, { n, ...params });
  }

  return { t, plural, locale, setLocale };
}
