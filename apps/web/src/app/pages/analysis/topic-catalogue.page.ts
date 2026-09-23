import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type { AppListItemResponse } from '@reviewinbox/contracts'
import { ConfirmationService } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { SelectModule } from 'primeng/select'
import { TabsModule } from 'primeng/tabs'
import { Subject, takeUntil } from 'rxjs'

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
    ConfirmDialogModule,
    FormsModule,
    RouterLink,
    SelectModule,
    TabsModule,
    TranslocoDirective,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [ConfirmationService],
  templateUrl: './topic-catalogue.page.html',
})
export class TopicCataloguePageComponent {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly destroyRef = inject(DestroyRef)
  private readonly appsService = inject(AppsService)
  private readonly analysisService = inject(AnalysisService)
  private readonly appIcons = inject(AppIconsService)
  private readonly transloco = inject(TranslocoService)
  private readonly confirmation = inject(ConfirmationService)
  private readonly mutationCancelled = new Subject<void>()

  protected readonly selectedAppId = signal(this.route.snapshot.queryParamMap.get('appId') ?? '')
  protected readonly editingTopicId = signal<string | null>(null)
  protected readonly draftLabel = signal('')
  protected readonly draftDescription = signal('')
  protected readonly showCreateTopic = signal(false)
  protected readonly pendingAction = signal<string | null>(null)
  protected readonly selectedView = signal<'active' | 'rejected'>('active')
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
  protected readonly activeTopics = computed(() =>
    this.catalogueTopics().filter((topic) => topic.status !== 'rejected'),
  )
  protected readonly rejectedTopics = computed(() =>
    this.catalogueTopics().filter((topic) => topic.status === 'rejected'),
  )
  protected readonly visibleTopics = computed(() =>
    this.selectedView() === 'rejected' ? this.rejectedTopics() : this.activeTopics(),
  )
  protected readonly emptyTitleKey = computed(() =>
    this.selectedView() === 'rejected'
      ? 'analysis.catalogue.emptyRejectedTitle'
      : 'analysis.catalogue.emptyTitle',
  )
  protected readonly emptyDescriptionKey = computed(() =>
    this.selectedView() === 'rejected'
      ? 'analysis.catalogue.emptyRejectedDescription'
      : 'analysis.catalogue.emptyDescription',
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
    this.cancelMutations()
    this.selectedAppId.set(value)
    this.message.set(null)
    this.cancelTopicEdit()
    this.draftLabel.set('')
    this.draftDescription.set('')
    this.pendingAction.set(null)
    this.selectedView.set('active')
    this.mergeTargetByTopicId.set({})
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
    this.cancelMutations()
    this.pendingAction.set(topicId ?? 'create')
    const request =
      topicId === null
        ? this.analysisService.createTopic(appId, { label, description, status: 'approved' })
        : this.analysisService.updateTopic(appId, topicId, { label, description })
    request.pipe(takeUntil(this.mutationCancelled), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.message.set({ type: 'success', key: 'analysis.messages.topicSaved' })
        this.cancelTopicEdit()
        this.catalogueResource.reload()
        this.pendingAction.set(null)
      },
      error: () => {
        this.message.set({ type: 'error', key: 'analysis.messages.actionFailed' })
        this.pendingAction.set(null)
      },
    })
  }

  protected setTopicStatus(topic: AnalysisTopic, status: AnalysisTopic['status']): void {
    const appId = this.catalogueAppId()
    if (appId === undefined || appId === '') {
      return
    }
    this.cancelMutations()
    this.pendingAction.set(topic.id)
    this.analysisService
      .updateTopic(appId, topic.id, { status })
      .pipe(takeUntil(this.mutationCancelled), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.message.set({ type: 'success', key: 'analysis.messages.topicSaved' })
          this.catalogueResource.reload()
          this.pendingAction.set(null)
        },
        error: () => {
          this.message.set({ type: 'error', key: 'analysis.messages.actionFailed' })
          this.pendingAction.set(null)
        },
      })
  }

  protected changeView(value: string | number | undefined): void {
    if (value === 'active' || value === 'rejected') {
      this.selectedView.set(value)
      this.cancelTopicEdit()
    }
  }

  protected confirmTopicRejection(topic: AnalysisTopic): void {
    this.confirmation.confirm({
      key: 'reject-topic',
      header: this.transloco.translate('analysis.catalogue.rejectTitle'),
      message: this.transloco.translate('analysis.catalogue.rejectDescription', {
        name: topic.label,
      }),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.transloco.translate('analysis.actions.reject'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      defaultFocus: 'reject',
      accept: () => {
        this.setTopicStatus(topic, 'rejected')
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
    this.cancelMutations()
    this.pendingAction.set(topic.id)
    this.analysisService
      .mergeTopics(appId, topic.id, targetTopicId)
      .pipe(takeUntil(this.mutationCancelled), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.message.set({ type: 'success', key: 'analysis.messages.topicMerged' })
          this.mergeTargetByTopicId.update((targets) => ({ ...targets, [topic.id]: '' }))
          this.catalogueResource.reload()
          this.pendingAction.set(null)
        },
        error: () => {
          this.message.set({ type: 'error', key: 'analysis.messages.actionFailed' })
          this.pendingAction.set(null)
        },
      })
  }

  protected discoverTopics(): void {
    const appId = this.catalogueAppId()
    if (appId === undefined || appId === '') {
      return
    }
    this.cancelMutations()
    this.pendingAction.set('discover')
    this.analysisService
      .discoverTopics(appId)
      .pipe(takeUntil(this.mutationCancelled), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.message.set({ type: 'success', key: 'analysis.messages.discoveryQueued' })
          this.catalogueResource.reload()
          this.pendingAction.set(null)
        },
        error: () => {
          this.message.set({ type: 'error', key: 'analysis.messages.actionFailed' })
          this.pendingAction.set(null)
        },
      })
  }

  private cancelMutations(): void {
    this.mutationCancelled.next()
  }

  protected isPending(topic: AnalysisTopic): boolean {
    return topic.status === 'pending'
  }
}
