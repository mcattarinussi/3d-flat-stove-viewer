import { defineConfig } from 'vitest/config';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
      name: 'copy-site-data',
      apply: 'build',
      closeBundle() {
        // The dev server serves these from the project root; the static build needs them next to the pages.
        for (const dir of ['data', 'assets/catalogues']) {
          cpSync(`${root}${dir}`, `${root}dist/${dir}`, { recursive: true });
        }
      },
    },
  ],
  test: { environment: 'node' },
});
