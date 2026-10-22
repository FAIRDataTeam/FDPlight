import { createApp } from 'vue';
import App from './App.vue';

// Self-hosted brand fonts (latin subset), inlined by the single-file build.
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';

import './style.css';

createApp(App).mount('#app');
