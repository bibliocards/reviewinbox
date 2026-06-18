import { provideHttpClient } from "@angular/common/http"
import {
  type ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from "@angular/core"
import { provideTransloco } from "@jsverse/transloco"
import { providePrimeNG } from "primeng/config"
import { reviewInboxTheme } from "./theme"
import { TranslocoHttpLoader } from "./transloco-loader"

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    providePrimeNG({
      theme: {
        preset: reviewInboxTheme,
        options: {
          darkModeSelector: ".dark",
          cssLayer: {
            name: "primeng",
            order: "theme, base, primeng, utilities",
          },
        },
      },
    }),
    provideHttpClient(),
    provideTransloco({
      config: {
        availableLangs: ["en", "fr"],
        defaultLang: "en",
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
  ],
}
