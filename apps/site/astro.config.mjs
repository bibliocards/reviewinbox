import starlight from '@astrojs/starlight'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://reviewinbox.app',
  outDir: '../../dist/apps/site',
  integrations: [
    starlight({
      title: 'ReviewInbox',
      customCss: ['./src/styles.css'],
      defaultLocale: 'root',
      sidebar: [
        {
          label: 'Guides',
          items: [{ label: 'Self-hosting', slug: 'docs/self-hosting' }],
        },
      ],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/bibliocards/reviewinbox' }],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})
