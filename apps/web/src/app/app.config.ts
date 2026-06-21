import { provideHttpClient } from '@angular/common/http'
import { type ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core'
import { provideRouter } from '@angular/router'
import { provideServiceWorker } from '@angular/service-worker'
import { stripeClient } from '@better-auth/stripe/client'
import { provideTransloco } from '@jsverse/transloco'
import { organizationClient } from 'better-auth/client/plugins'
import { provideBetterAuth } from 'ngx-better-auth'
import { providePrimeNG } from 'primeng/config'
import { DialogService } from 'primeng/dynamicdialog'
import { environment } from '../environments/environment'
import { resolveOptionalString } from '../environments/environment.model'
import { appRoutes } from './app.routes'
import { reviewInboxTheme } from './shared/theme'
import { TranslocoHttpLoader } from './shared/transloco-loader'

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
      baseURL: resolveOptionalString(environment.apiUrl),
      basePath: resolveOptionalString(environment.authBasePath) ?? '/api/auth',
      plugins: [organizationClient(), stripeClient({ subscription: true })],
    }),
    provideRouter(appRoutes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.production || !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideHttpClient(),
    provideTransloco({
      config: {
        availableLangs: ['en', 'fr'],
        defaultLang: 'en',
        reRenderOnLangChange: true,
        prodMode: environment.production || !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    DialogService,
  ],
}
