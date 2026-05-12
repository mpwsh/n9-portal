// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// We're producing a fully static site. The Workers runtime serves the
// built files via the assets binding; only /api/* falls through to
// worker.js. No SSR adapter needed.
export default defineConfig({
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});
