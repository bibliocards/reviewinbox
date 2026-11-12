import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslocoService } from '@jsverse/transloco'

@Component({
  selector: 'ri-language-flag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.title]': 'display().title' },
  template: `
    @let flag = display();
    @if (flag.src && flag.src !== failedSrc()) {
      <img
        class="inline-block h-auto w-[1.25em] align-middle"
        width="16"
        height="12"
        [src]="flag.src"
        [alt]="flag.name"
        (error)="failedSrc.set(flag.src)"
      />
    } @else {
      {{ language() }}
    }
  `,
})
export class LanguageFlagComponent {
  readonly language = input.required<string>()
  protected readonly failedSrc = signal<string | null>(null)

  private readonly transloco = inject(TranslocoService)
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  })
  private readonly languageNames = computed(
    () => new Intl.DisplayNames(this.activeLanguage(), { type: 'language', fallback: 'none' }),
  )

  protected readonly display = computed(() => {
    const language = this.language()
    try {
      const locale = new Intl.Locale(language)
      const name = this.languageNames().of(locale.baseName)
      const region = locale.maximize().region
      if (name !== undefined && region?.length === 2) {
        return { src: `/flags/${region.toLowerCase()}.svg`, name, title: `${name} (${language})` }
      }
      return { title: name ?? null }
    } catch {
      return { title: null }
    }
  })
}
