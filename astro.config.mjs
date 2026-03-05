// @ts-check
import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import preact from '@astrojs/preact';

// https://astro.build/config
export default defineConfig({
  integrations: [svelte(), preact({ compat: true })],

  vite: {
    plugins: [tailwindcss()]
  }
});