/**
 * File: vite.config.js
 * Purpose: Vite build configuration for multi-page app.
 *   - main   → index.html  (auth + lobby start screen)
 *   - player → player.html (live player dashboard)
 *   - admin  → admin.html  (admin-only round setup)
 *   - howToPlay → how-to-play.html (static player guide, no script); one
 *     more page per extra language in src/config/guide-languages.js
 *   - privacy / imprint → privacy.html, imprint.html (static legal page
 *     templates for the operator, no script)
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { defineConfig } from 'vite';
import { GUIDE_LANGUAGES } from './src/config/guide-languages.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Fixed, non-default ports so this project can run next to other Vite
  // projects on the same machine (Vite's defaults are 5173 / 4173).
  server: {
    host: '127.0.0.1',
    port: 5273,
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
  preview: {
    host: '127.0.0.1',
    port: 4273,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        player: resolve(__dirname, 'player.html'),
        admin: resolve(__dirname, 'admin.html'),
        howToPlay: resolve(__dirname, 'how-to-play.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        imprint: resolve(__dirname, 'imprint.html'),
        ...Object.fromEntries(
          GUIDE_LANGUAGES.filter((lang) => lang.code !== 'en').map((lang) => [
            `howToPlay_${lang.code}`,
            resolve(__dirname, lang.file),
          ])
        ),
      },
    },
  },
});
