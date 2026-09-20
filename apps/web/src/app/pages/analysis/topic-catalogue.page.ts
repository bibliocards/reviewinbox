import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type { AppListItemResponse } from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'
import { SelectModule } from 'primeng/select'

import type { AppSelectOption } from '../../shared/components/app-select/app-select.component'
import { AppSelectComponent } from '../../shared/components/app-select/app-select.component'
import { AnalysisService, type AnalysisTopic } from '../../shared/services/analysis.service'
import { AppIconsService } from '../../shared/services/app-icons.service'
import { AppsService } from '../../shared/services/apps.service'

@Component({
  selector: 'ri-topic-catalogue-page',
  imports: [
    AppSelectComponent,
    ButtonModule,
    FormsModule,
    RouterLink,
    SelectModule,
    TranslocoDirective,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './topic-catalogue.page.html',
})
export class TopicCataloguePageComponent {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly appsService = inject(AppsService)
  private readonly analysisService = inject(AnalysisService)
  private readonly appIcons = inject(AppIconsService)
  private readonly transloco = inject(TranslocoService)

  protected readonly selectedAppId = signal(this.route.snapshot.queryParamMap.get('appId') ?? '')
  protected readonly editingTopicId = signal<string | null>(null)
  protected readonly draftLabel = signal('')
  protected readonly draftDescription = signal('')
  protected readonly showCreateTopic = signal(false)
  protected readonly pendingAction = signal<string | null>(null)
  protected readonly mergeTargetByTopicId = signal<Record<string, string>>({})
  protected readonly message = signal<{ type: 'success' | 'error'; key: string } | null>(null)
  protected readonly appsResource = this.appsService.appsResource()
  protected readonly apps = computed<AppListItemResponse[]>(() =>
    this.appsResource.hasValue() ? this.appsResource.value().apps : [],
  )
  protected readonly appOptions = computed<AppSelectOption[]>(() =>
    this.apps().map((app) => ({
      label: app.name,
      value: app.id,
      imageUrl: this.appIcons.iconUrl(app.id),
    })),
  )
  protected readonly catalogueAppId = computed(() => {
    const appId = this.selectedAppId()
    return appId === '' ? undefined : appId
  })
  protected readonly catalogueResource = this.analysisService.topicsResource(() =>
    this.catalogueAppId(),
  )
  protected readonly catalogueTopics = computed<readonly AnalysisTopic[]>(() =>
    this.catalogueResource.hasValue()
      ? this.catalogueResource.value().topics.filter((topic) => topic.mergedIntoId === null)
      : [],
  )
  protected readonly canManageCatalogue = computed(() =>
    this.catalogueResource.hasValue() ? this.catalogueResource.value().canManage : false,
  )

  constructor() {
    effect(() => {
      this.appIcons.loadIcons(this.apps())
      const appId = this.selectedAppId()
      const firstAppId = this.apps()[0]?.id
      if (appId === '' && firstAppId !== undefined) {
        this.selectedAppId.set(firstAppId)
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { appId: firstAppId },
          replaceUrl: true,
        })
      }
    })
  }

  protected changeApp(value: string): void {
    this.selectedAppId.set(value)
    this.message.set(null)
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { appId: value || null },
      replaceUrl: true,
    })
  }

  protected beginCreateTopic(): void {
    this.editingTopicId.set(null)
    this.draftLabel.set('')
    this.draftDescription.set('')
    this.showCreateTopic.set(true)
  }

  protected beginEditTopic(topic: AnalysisTopic): void {
    this.showCreateTopic.set(false)
    this.editingTopicId.set(topic.id)
    this.draftLabel.set(topic.label)
    this.draftDescription.set(topic.description)
  }

  protected cancelTopicEdit(): void {
    this.editingTopicId.set(null)
    this.showCreateTopic.set(false)
  }

  protected saveTopic(): void {
    const appId = this.catalogueAppId()
    const label = this.draftLabel().trim()
    const description = this.draftDescription().trim()
    if (appId === undefined || appId === '' || label === '' || description === '') {
      return
    }
    const topicId = this.editingTopicId()
    this.pendingAction.set(topicId ?? 'create')
    const request =
      topicId === null
        ? this.analysisService.createTopic(appId, { label, description, status: 'approved' })
        : this.analysisService.updateTopic(appId, topicId, { label, description })
    request.subscribe({
      next: () => {
        this.message.set({ type: 'success', key: 'analysis.messages.topicSaved' })
        this.cancelTopicEdit()
        this.catalogueResource.reload()
      },
      error: () => {
        this.message.set({ type: 'error', key: 'analysis.messages.actionFailed' })
        this.pendingAction.set(null)
      },
      complete: () => {
        this.pendingAction.set(null)
      },
    })
  }

  protected setTopicStatus(topic: AnalysisTopic, status: AnalysisTopic['status']): void {
    const appId = this.catalogueAppId()
    if (appId === undefined || appId === '') {
      return
    }
    this.pendingAction.set(topic.id)
    this.analysisService.updateTopic(appId, topic.id, { status }).subscribe({
      next: () => {
        this.message.set({ type: 'success', key: 'analysis.messages.topicSaved' })
        this.catalogueResource.reload()
      },
      error: () => {
        this.message.set({ type: 'error', key: 'analysis.messages.actionFailed' })
        this.pendingAction.set(null)
      },
      complete: () => {
        this.pendingAction.set(null)
      },
    })
  }

  protected mergeTarget(topicId: string): string {
    return this.mergeTargetByTopicId()[topicId] ?? ''
  }

  protected selectMergeTarget(topicId: string, targetTopicId: string | null): void {
    this.mergeTargetByTopicId.update((targets) => ({ ...targets, [topicId]: targetTopicId ?? '' }))
  }

  protected mergeTargets(topic: AnalysisTopic): AnalysisTopic[] {
    return this.catalogueTopics().filter(
      (candidate) =>
        candidate.id !== topic.id
        && candidate.status !== 'rejected'
        && candidate.mergedIntoId === null,
    )
  }

  protected confirmMerge(topic: AnalysisTopic): void {
    const appId = this.catalogueAppId()
    const targetTopicId = this.mergeTarget(topic.id)
    if (appId === undefined || appId === '' || targetTopicId === '') {
      return
    }
    this.pendingAction.set(topic.id)
    this.analysisService.mergeTopics(appId, topic.id, targetTopicId).subscribe({
      next: () => {
        this.message.set({ type: 'success', key: 'analysis.messages.topicMerged' })
        this.mergeTargetByTopicId.update((targets) => ({ ...targets, [topic.id]: '' }))
        this.catalogueResource.reload()
      },
      error: () => {
        this.message.set({ type: 'error', key: 'analysis.messages.actionFailed' })
        this.pendingAction.set(null)
      },
      complete: () => {
        this.pendingAction.set(null)
      },
    })
  }

  protected discoverTopics(): void {
    const appId = this.catalogueAppId()
    if (appId === undefined || appId === '') {
      return
    }
    this.pendingAction.set('discover')
    this.analysisService.discoverTopics(appId).subscribe({
      next: () => {
        this.message.set({ type: 'success', key: 'analysis.messages.discoveryQueued' })
        this.catalogueResource.reload()
      },
      error: () => {
        this.message.set({ type: 'error', key: 'analysis.messages.actionFailed' })
        this.pendingAction.set(null)
      },
      complete: () => {
        this.pendingAction.set(null)
      },
    })
  }

  protected isPending(topic: AnalysisTopic): boolean {
    return topic.status === 'pending'
  }
}
