import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslocoDirective } from '@jsverse/transloco'
import { ButtonModule } from 'primeng/button'
import { SelectModule } from 'primeng/select'

import {
  AppSelectComponent,
  type AppSelectOption,
} from '../../shared/components/app-select/app-select.component'

export type AnalysisFilterChange = { name: string; value: string }

@Component({
  selector: 'ri-analysis-filters',
  imports: [AppSelectComponent, ButtonModule, FormsModule, SelectModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './analysis-filters.component.html',
})
export class AnalysisFiltersComponent {
  readonly appOptions = input.required<readonly AppSelectOption[]>()
  readonly selectedAppId = input.required<string>()
  readonly from = input('')
  readonly to = input('')
  readonly provider = input('')
  readonly version = input('')
  readonly severity = input('')
  readonly intent = input('')
  readonly topicId = input('')
  readonly topicStatus = input('')
  readonly storeOptions = input.required<readonly { label: string; value: string }[]>()
  readonly versionOptions = input.required<readonly { label: string; value: string }[]>()
  readonly severityOptions = input.required<readonly { label: string; value: string }[]>()
  readonly intentOptions = input.required<readonly { label: string; value: string }[]>()
  readonly topicOptions = input.required<readonly { label: string; value: string }[]>()
  readonly topicStatusOptions = input.required<readonly { label: string; value: string }[]>()
  readonly change = output<AnalysisFilterChange>()
  readonly clear = output()

  protected emit(name: string, value: string): void {
    this.change.emit({ name, value })
  }
}
