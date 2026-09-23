import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslocoDirective } from '@jsverse/transloco'
import { ButtonModule } from 'primeng/button'
import { DatePickerModule } from 'primeng/datepicker'
import { SelectModule } from 'primeng/select'

import {
  AppSelectComponent,
  type AppSelectOption,
} from '../../shared/components/app-select/app-select.component'
import { formatAnalysisDate, parseAnalysisDate } from './analysis-date-filter'

export type AnalysisFilterName =
  | 'appId'
  | 'from'
  | 'to'
  | 'provider'
  | 'version'
  | 'severity'
  | 'intent'
  | 'topicId'
  | 'topicStatus'
export type AnalysisFilterChange = { name: AnalysisFilterName; value: string }

@Component({
  selector: 'ri-analysis-filters',
  imports: [
    AppSelectComponent,
    ButtonModule,
    DatePickerModule,
    FormsModule,
    SelectModule,
    TranslocoDirective,
  ],
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
  protected readonly fromDate = computed(() => parseAnalysisDate(this.from()))
  protected readonly toDate = computed(() => parseAnalysisDate(this.to()))
  protected readonly additionalOpen = signal(false)
  protected readonly additionalFilters = computed(
    () =>
      [
        {
          name: 'severity',
          labelKey: 'analysis.filters.severity',
          value: this.severity(),
          options: this.severityOptions(),
        },
        {
          name: 'intent',
          labelKey: 'analysis.filters.intent',
          value: this.intent(),
          options: this.intentOptions(),
        },
        {
          name: 'topicId',
          labelKey: 'analysis.filters.topic',
          value: this.topicId(),
          options: this.topicOptions(),
        },
        {
          name: 'topicStatus',
          labelKey: 'analysis.filters.topicStatus',
          value: this.topicStatus(),
          options: this.topicStatusOptions(),
        },
      ] as const,
  )
  protected readonly activeAdditionalFilters = computed(() =>
    this.additionalFilters().filter((filter) => filter.value),
  )
  protected readonly hasFilters = computed(() =>
    Boolean(
      this.from()
      || this.to()
      || this.provider()
      || this.version()
      || this.activeAdditionalFilters().length > 0,
    ),
  )

  protected selectedOptionLabel(filter: {
    value: string
    options: readonly { label: string; value: string }[]
  }): string {
    return filter.options.find((option) => option.value === filter.value)?.label ?? filter.value
  }

  protected emit(name: AnalysisFilterName, value: string): void {
    this.change.emit({ name, value })
  }

  protected emitDate(name: 'from' | 'to', value: Date | null | undefined): void {
    this.emit(name, formatAnalysisDate(value))
  }
}
