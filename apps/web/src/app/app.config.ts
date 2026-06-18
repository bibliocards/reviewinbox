import { provideHttpClient } from "@angular/common/http"
import {
  type ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from "@angular/core"
import { provideTransloco } from "@jsverse/transloco"
import Aura from "@primeuix/themes/aura"
import { providePrimeNG } from "primeng/config"
import { TranslocoHttpLoader } from "./transloco-loader"

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: ".dark",
          cssLayer: {
            name: "primeng",
            order: "theme, base, primeng",
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
