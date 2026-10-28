import { Component, input, model, ChangeDetectionStrategy } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { SelectModule } from 'primeng/select'

import { TypedTemplateDirective } from '../../directives/typed-template.directive'
import { initialsFrom } from '../../initials'

export type AppSelectOption = { label: string; value: string; imageUrl?: string | null }

@Component({
  selector: 'ri-app-select',
  imports: [FormsModule, SelectModule, TypedTemplateDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './app-select.component.html',
})
export class AppSelectComponent {
  readonly options = input.required<readonly AppSelectOption[]>()
  readonly selectedAppId = model<string>('')
  readonly ariaLabel = input.required<string>()
  readonly styleClass = input('w-full sm:w-56')

  protected readonly initialsFrom = initialsFrom
}
