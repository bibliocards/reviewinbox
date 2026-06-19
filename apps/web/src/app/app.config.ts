import { provideHttpClient } from '@angular/common/http'
import { type ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core'
import { provideRouter } from '@angular/router'
import { provideTransloco } from '@jsverse/transloco'
import { organizationClient } from 'better-auth/client/plugins'
import { provideBetterAuth } from 'ngx-better-auth'
import { providePrimeNG } from 'primeng/config'
import { appRoutes } from './app.routes'
import { reviewInboxTheme } from './theme'
import { TranslocoHttpLoader } from './transloco-loader'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    providePrimeNG({
      theme: {
        preset: reviewInboxTheme,
        options: {
          darkModeSelector: '.dark',
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng, utilities',
          },
        },
      },
    }),
    provideBetterAuth({
      basePath: '/auth',
      plugins: [organizationClient()],
    }),
    provideRouter(appRoutes),
    provideHttpClient(),
    provideTransloco({
      config: {
        availableLangs: ['en', 'fr'],
        defaultLang: 'en',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
  ],
}
