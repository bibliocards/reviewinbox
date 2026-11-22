import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import {
  type SyncWebhookInput,
  syncWebhookInputSchema,
  type SyncWebhookSettings,
} from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { SelectModule } from 'primeng/select'
import { type Observable, finalize } from 'rxjs'
import { z } from 'zod'

const endpoint = '/api/organization/sync-webhook'
const invalidUrlErrorSchema = z.object({ errorCode: z.literal('invalid_webhook_url') })

@Component({
  selector: 'ri-sync-webhook-page',
  imports: [FormsModule, InputTextModule, SelectModule, ButtonModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './sync-webhook.page.html',
})
export class SyncWebhookPageComponent {
  private readonly http = inject(HttpClient)
  private readonly destroyRef = inject(DestroyRef)
  private readonly transloco = inject(TranslocoService)

  protected readonly kind = signal<SyncWebhookInput['kind']>('slack')
  protected readonly url = signal('')
  protected readonly signingSecret = signal('')
  protected readonly settings = signal<SyncWebhookSettings | null>(null)
  protected readonly busy = signal(false)
  protected readonly message = signal<{ key: string; error: boolean } | null>(null)
  protected readonly urlInvalid = signal(false)
  protected readonly kinds = [
    { value: 'slack', label: 'Slack' },
    { value: 'discord', label: 'Discord' },
    { value: 'json', label: 'JSON' },
  ]
  protected readonly validInput = computed(() => {
    const common = { kind: this.kind(), url: this.url().trim() }
    const input =
      common.kind === 'json' ? { ...common, signingSecret: this.signingSecret() } : common
    return syncWebhookInputSchema.safeParse(input).data
  })

  protected changeUrl(value: string): void {
    this.url.set(value)
    this.urlInvalid.set(false)
  }

  private organizationRevision = 0

  constructor() {
    this.reload()
  }

  @HostListener('window:reviewinbox:active-organization-changed')
  protected reload(): void {
    this.organizationRevision += 1
    this.settings.set(null)
    this.clearSecrets()
    this.request(this.http.get<SyncWebhookSettings>(endpoint), (settings) => {
      this.applySettings(settings)
    })
  }

  protected save(event: Event): void {
    event.preventDefault()
    const input = this.validInput()
    if (input && !this.busy()) {
      this.request(this.http.put<SyncWebhookSettings>(endpoint, input), (settings) => {
        this.applySettings(settings)
        this.message.set({ key: 'saved', error: false })
      })
    }
  }

  protected remove(): void {
    this.request(this.http.delete<SyncWebhookSettings>(endpoint), (settings) => {
      this.applySettings(settings)
      this.message.set({ key: 'removed', error: false })
    })
  }

  protected test(saved: boolean): void {
    const input = this.validInput()
    if (!saved && !input) {
      return
    }
    const path = `${endpoint}/${saved ? 'test-saved' : 'test'}`
    this.request(
      this.http.post(path, saved ? null : input),
      () => {
        this.message.set({ key: 'testSent', error: false })
      },
      'testFailed',
    )
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat(this.transloco.getActiveLang(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  }

  private applySettings(settings: SyncWebhookSettings): void {
    this.settings.set(settings)
    this.kind.set(settings.destination?.kind ?? 'slack')
    this.clearSecrets()
  }

  private clearSecrets(): void {
    this.changeUrl('')
    this.signingSecret.set('')
  }

  private request<T>(
    request: Observable<T>,
    next: (value: T) => void,
    errorKey = 'requestFailed',
  ): void {
    const revision = this.organizationRevision
    this.busy.set(true)
    this.message.set(null)
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (this.organizationRevision === revision) {
            this.busy.set(false)
          }
        }),
      )
      .subscribe({
        next: (value) => {
          if (this.organizationRevision === revision) {
            next(value)
          }
        },
        error: (error: HttpErrorResponse) => {
          if (this.organizationRevision !== revision) {
            return
          }
          if (invalidUrlErrorSchema.safeParse(error.error).success) {
            this.urlInvalid.set(true)
          } else {
            this.message.set({ key: errorKey, error: true })
          }
        },
      })
  }
}
