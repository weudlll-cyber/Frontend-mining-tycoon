/**
 * File: vite.config.js
 * Purpose: Vite build configuration for multi-page app.
 *   - main   → index.html  (auth + lobby start screen)
 *   - player → player.html (live player dashboard)
 *   - admin  → admin.html  (admin-only round setup)
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      // Exclude dirs that have no source to watch — watcher overload is the
      // most common reason Vite exits silently on Windows.
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/coverage/**',
        '**/.vscode/**',
        '**/.git/**',
      ],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        player: resolve(__dirname, 'player.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
