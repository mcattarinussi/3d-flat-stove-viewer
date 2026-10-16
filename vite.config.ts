import { defineConfig } from 'vitest/config';
import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { frontsMiddleware } from './scripts/frontsMiddleware';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { main: `${root}index.html`, compare: `${root}compare.html` },
    },
  },
  plugins: [
    {
      name: 'fronts-api',
      apply: 'serve',
      configureServer(server) {
        // Lets the in-app cropper save front-photo crops while developing; absent from builds.
        server.middlewares.use(frontsMiddleware(`${root}public/stove-images`));
      },
    },
    {
      name: 'copy-site-data',
      apply: 'build',
      closeBundle() {
        // The dev server serves these from the project root; the static build needs them next to the pages.
        // assets/catalogues is not in git (local only), so it is copied only when present.
        for (const dir of ['data', 'assets/catalogues']) {
          if (existsSync(`${root}${dir}`)) cpSync(`${root}${dir}`, `${root}dist/${dir}`, { recursive: true });
        }
      },
    },
  ],
  test: { environment: 'node' },
});
