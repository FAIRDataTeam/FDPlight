/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  server: {
    port: 5174,
    open: true,
  },
  build: {
    // Inline everything — no threshold, no separate chunk files
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.ts'],
    // src/core is DOM-free; its tests read fixtures from disk.
    environmentMatchGlobs: [['src/core/**', 'node']],
  },
});
