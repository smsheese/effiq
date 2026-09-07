// @ts-check
import { defineConfig } from 'astro/config';

try {
  process.loadEnvFile();
} catch {
  // .env is optional
}

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
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
    sitemap({
      filter: (page) => !page.includes('/404') && !page.includes('/api/'),
    }),
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
