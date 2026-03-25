/**
 * File: vite.config.js
 * Purpose: Vite build configuration for multi-page app.
 *   - main   → index.html  (player UI)
 *   - admin  → admin.html  (admin-only round setup)
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
