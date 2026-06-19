import { Component } from '@angular/core'
import { TranslocoDirective } from '@jsverse/transloco'

@Component({
  selector: 'ri-organizations-new-page',
  imports: [TranslocoDirective],
  template: `
    <section
      class="grid gap-3 rounded-2xl border border-hairline bg-surface-1 p-5"
      *transloco="let t">
      <p class="ri-chip ri-chip-primary w-fit">{{ t('organizations.new.badge') }}</p>
      <h1 class="m-0 text-2xl font-semibold tracking-[-0.8px] text-ink">{{ t('organizations.new.title') }}</h1>
      <p class="m-0 max-w-2xl text-sm text-ink-subtle">{{ t('organizations.new.description') }}</p>
    </section>
  `,
})
export class OrganizationsNewPageComponent {}
