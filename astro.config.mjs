// @ts-check
import { defineConfig } from 'astro/config';

try {
  process.loadEnvFile();
} catch {
  // .env is optional
}

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { resolveSiteUrl } from './src/lib/site.ts';

const isBuild = process.argv.includes('build');
const site = resolveSiteUrl({
  siteUrl: process.env.SITE_URL,
  isBuild,
  allowLocal: process.env.ALLOW_LOCAL_SITE_URL === '1',
});

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site,
  integrations: [
    react(),
    // Discovery files come from src/pages/sitemap.xml.ts — a single sitemap
    // source of truth. The @astrojs/sitemap integration was removed because it
    // emitted a second, conflicting /sitemap-index.xml.
  ],

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': '/src'
      }
    },
    build: {
      // Never ship production source maps — they expose source and inflate assets.
      sourcemap: false,
    }
  }
});
