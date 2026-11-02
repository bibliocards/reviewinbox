import { Component, ChangeDetectionStrategy, DOCUMENT, effect, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterOutlet } from '@angular/router'
import { TranslocoService } from '@jsverse/transloco'

@Component({
  selector: 'ri-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './app.component.html',
})
export class AppComponent {
  private readonly document = inject(DOCUMENT)
  private readonly transloco = inject(TranslocoService)
  private readonly language = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  })

  protected readonly applicationName = 'ReviewInbox'

  constructor() {
    effect(() => {
      this.document.documentElement.lang = this.language()
    })
  }
}
