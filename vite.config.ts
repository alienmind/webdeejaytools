import { defineConfig } from 'vite';
import devServer from '@hono/vite-dev-server';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    devServer({
      entry: 'src/server/index.ts',
      injectClientScript: false,
      exclude: [
        /^(?!\/api).*/, // Exclude everything that does not start with /api
      ],
    }),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
      '@client': path.resolve(__dirname, './src/client'),
      '@server': path.resolve(__dirname, './src/server'),
      '@services': path.resolve(__dirname, './src/server/services'),
      '@db': path.resolve(__dirname, './src/server/db'),
    },
  },
});
