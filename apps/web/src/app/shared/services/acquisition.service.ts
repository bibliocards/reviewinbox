import { Injectable } from '@angular/core'
import {
  acquisitionFromVisit,
  acquisitionStorageKey,
  parseStoredAcquisition,
  type Acquisition,
} from '@reviewinbox/contracts'

@Injectable({ providedIn: 'root' })
export class AcquisitionService {
  attribution: Acquisition | null = this.capture()

  clear(): void {
    this.attribution = null
    try {
      sessionStorage.removeItem(acquisitionStorageKey)
    } catch {
      // Storage is optional; account creation must remain available without it.
    }
  }

  private capture() {
    const current = acquisitionFromVisit(new URL(window.location.href), document.referrer)
    try {
      const acquisition =
        parseStoredAcquisition(sessionStorage.getItem(acquisitionStorageKey)) ?? current
      sessionStorage.setItem(acquisitionStorageKey, JSON.stringify(acquisition))
      return acquisition
    } catch {
      return current
    }
  }
}
