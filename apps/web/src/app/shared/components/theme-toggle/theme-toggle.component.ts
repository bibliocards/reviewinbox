import { DOCUMENT } from '@angular/common'
import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core'
import { TranslocoDirective } from '@jsverse/transloco'
import { ButtonModule } from 'primeng/button'

@Component({
  selector: 'ri-theme-toggle',
  imports: [ButtonModule, TranslocoDirective],
  templateUrl: './theme-toggle.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { class: 'inline-flex' },
})
export class ThemeToggleComponent {
  private readonly document = inject(DOCUMENT)

  protected readonly isDarkTheme = signal(false)
  protected readonly themeLabel = computed(() =>
    this.isDarkTheme() ? 'common.useLightTheme' : 'common.useDarkTheme',
  )
  protected readonly themeIcon = computed(() => (this.isDarkTheme() ? 'pi pi-sun' : 'pi pi-moon'))

  constructor() {
    const storedTheme = localStorage.getItem('ri-theme')
    const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches ?? false

    this.setTheme(
      storedTheme !== null && storedTheme !== '' ? storedTheme === 'dark' : prefersDark,
      false,
    )
  }

  protected toggleTheme(): void {
    this.setTheme(!this.isDarkTheme())
  }

  private setTheme(isDark: boolean, persist = true): void {
    this.isDarkTheme.set(isDark)
    this.document.documentElement.classList.toggle('dark', isDark)

    if (persist) {
      localStorage.setItem('ri-theme', isDark ? 'dark' : 'light')
    }
  }
}
