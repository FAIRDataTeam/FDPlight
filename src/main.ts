import { createApp } from 'vue';
import { RECORD_I18N } from '@fairdatateam/record-core/i18n';
import App from './App.vue';
import { useI18n } from './composables/useI18n';

// Self-hosted brand fonts (latin subset), inlined by the single-file build.
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';

// The shared form renderer's styles, then FDPlight's own tokens and layout.
import '@fairdatateam/record-core/renderer.css';
import './style.css';

// The form renderer translates through FDPlight's catalogs (TASKS Phase 8).
const { t } = useI18n();
createApp(App).provide(RECORD_I18N, { t }).mount('#app');
