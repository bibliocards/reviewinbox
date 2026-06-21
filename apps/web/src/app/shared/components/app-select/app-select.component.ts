import { Component, input, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { SelectModule } from 'primeng/select'
import { TypedTemplateDirective } from '../../directives/typed-template.directive'

export type AppSelectOption = {
  label: string
  value: string
  imageUrl?: string | null
}

@Component({
  selector: 'ri-app-select',
  imports: [FormsModule, SelectModule, TypedTemplateDirective],
  templateUrl: './app-select.component.html',
})
export class AppSelectComponent {
  readonly options = input.required<readonly AppSelectOption[]>()
  readonly selectedAppId = model<string>('')
  readonly ariaLabel = input.required<string>()
  readonly styleClass = input('w-full sm:w-56')

  protected initialsFrom(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
  }
}
