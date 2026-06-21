import starlight from '@astrojs/starlight'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://reviewinbox.app',
  outDir: '../../dist/apps/site',
  integrations: [
    starlight({
      title: 'ReviewInbox',
      logo: {
        src: './public/icons/icon-192x192.png',
        alt: 'ReviewInbox app icon',
      },
      customCss: ['./src/styles.css'],
      head: [
        {
          tag: 'meta',
          attrs: {
            name: 'keywords',
            content:
              'ReviewInbox, app review management, app store reviews, Google Play reviews, App Store reviews, reply inbox, AI reply drafts, review response tool, mobile app support, self-hosted review management',
          },
        },
      ],
      defaultLocale: 'root',
      sidebar: [
        {
          label: 'Guides',
          items: [
            { label: 'Usage and limits', slug: 'docs/usage-limits' },
            { label: 'Self-hosting', slug: 'docs/self-hosting' },
          ],
        },
      ],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/bibliocards/reviewinbox' }],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})
