import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    outDir: 'dist-electron',
    emptyOutDir: true,
    target: 'node20',
    ssr: true,
    lib: {
      entry: path.resolve(__dirname, 'electron/main.ts'),
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        'electron',
        'better-sqlite3',
        'playwright',
        'playwright-extra',
        'puppeteer-extra-plugin-stealth',
        'fsevents',
      ],
    },
  },
});
