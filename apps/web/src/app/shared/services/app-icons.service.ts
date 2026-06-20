import { Injectable, signal } from '@angular/core'
import type { AppListItemResponse } from '@reviewinbox/contracts'

type AppIconState = {
  sourceId: string | null
  url: string | null
}

type AppleLookupResponse = {
  results?: Array<{
    artworkUrl100?: string
    artworkUrl512?: string
  }>
}

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

    this.iconStates.update((states) => ({
      ...states,
      [app.id]: { sourceId, url: null },
    }))

    if (!sourceId) {
      return
    }

    void this.resolveAppleIconUrl(sourceId).then((url) => {
      this.iconStates.update((states) => ({
        ...states,
        [app.id]: { sourceId, url },
      }))
    })
  }

  private appleAppStoreAppId(app: AppListItemResponse): string | null {
    return (
      app.storeConnections.find(
        (connection) =>
          connection.provider === 'apple_app_store' &&
          connection.status === 'active' &&
          connection.credential.hasCredential &&
          connection.externalAppId,
      )?.externalAppId ?? null
    )
  }

  private async resolveAppleIconUrl(appStoreAppId: string): Promise<string | null> {
    try {
      const response = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(appStoreAppId)}`)
      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as AppleLookupResponse
      const result = data.results?.[0]
      return result?.artworkUrl512 ?? result?.artworkUrl100 ?? null
    } catch {
      return null
    }
  }
}
