import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    outDir: 'dist-electron',
    emptyOutDir: true,
    target: 'node20',
    ssr: true,
    rollupOptions: {
      // Two entries: the Electron main process, and the analysis worker the pool spawns. The worker
      // has to be a real file on disk at runtime - worker_threads cannot spawn a function out of an
      // already-bundled module - so it is emitted alongside main.js.
      input: {
        main: path.resolve(__dirname, 'electron/main.ts'),
        'analysis-worker': path.resolve(__dirname, 'src/server/services/mp3/analysisWorker.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
      },
      external: [
        'electron',
        'fsevents',
      ],
    },
  },
});
