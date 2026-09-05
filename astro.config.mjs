// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL || 'https://models.example.com',
  integrations: [react(), sitemap()],

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': '/src'
      }
    }
  }
});