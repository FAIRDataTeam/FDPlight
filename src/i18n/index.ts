import en from './en';
import ptBR from './pt-BR';
import nlNL from './nl-NL';
import deDE from './de-DE';
import esES from './es-ES';
import frFR from './fr-FR';

export type Locale = 'en' | 'pt-BR' | 'nl-NL' | 'de-DE' | 'es-ES' | 'fr-FR';

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'pt-BR', label: 'PT' },
  { code: 'nl-NL', label: 'NL' },
  { code: 'de-DE', label: 'DE' },
  { code: 'es-ES', label: 'ES' },
  { code: 'fr-FR', label: 'FR' },
];

// English is the source of truth; other locales may be partial and fall back to it.
export const messages: Record<Locale, Record<string, unknown>> = {
  en,
  'pt-BR': ptBR,
  'nl-NL': nlNL,
  'de-DE': deDE,
  'es-ES': esES,
  'fr-FR': frFR,
};
