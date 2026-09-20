import { Injectable, signal } from '@angular/core'
import type { AppListItemResponse } from '@reviewinbox/contracts'
import { z } from 'zod'

type AppIconState = { sourceId: string | null; url: string | null }

const appleLookupResponseSchema = z.object({
  results: z
    .array(z.object({ artworkUrl100: z.string().optional(), artworkUrl512: z.string().optional() }))
    .optional(),
})
type AppleLookupResponse = z.infer<typeof appleLookupResponseSchema>

@Injectable({ providedIn: 'root' })
export class AppIconsService {
  private readonly iconStates = signal<Record<string, AppIconState>>({})

  iconUrl(appId: string): string | null {
    return this.iconStates()[appId]?.url ?? null
  }

  loadIcons(apps: readonly AppListItemResponse[]): void {
    for (const app of apps) {
      this.loadIcon(app)
    }
  }

  private loadIcon(app: AppListItemResponse): void {
    const sourceId = this.appleAppStoreAppId(app)
    const existing = this.iconStates()[app.id]
    if (existing?.sourceId === sourceId) {
      return
    }

    this.iconStates.update((states) => ({ ...states, [app.id]: { sourceId, url: null } }))

    if (sourceId === null) {
      return
    }

    void this.resolveAppleIconUrl(sourceId).then((url) => {
      this.iconStates.update((states) => ({ ...states, [app.id]: { sourceId, url } }))
      return url
    })
  }

  private appleAppStoreAppId(app: AppListItemResponse): string | null {
    return (
      app.storeConnections.find(
        (connection) =>
          connection.provider === 'apple_app_store'
          && connection.status === 'active'
          && connection.credential.hasCredential
          && connection.externalAppId !== null
          && connection.externalAppId !== '',
      )?.externalAppId ?? null
    )
  }

  private async resolveAppleIconUrl(appStoreAppId: string): Promise<string | null> {
    try {
      const response = await fetch(
        `https://itunes.apple.com/lookup?id=${encodeURIComponent(appStoreAppId)}`,
      )
      if (!response.ok) {
        return null
      }

      const data: AppleLookupResponse = appleLookupResponseSchema.parse(await response.json())
      const result = data.results?.[0]
      return result?.artworkUrl512 ?? result?.artworkUrl100 ?? null
    } catch {
      return null
    }
  }
}
