import { Component, ChangeDetectionStrategy, inject } from '@angular/core'
import { RouterOutlet } from '@angular/router'

import { AcquisitionService } from './shared/services/acquisition.service'

@Component({
  selector: 'ri-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './app.component.html',
})
export class AppComponent {
  private readonly acquisition = inject(AcquisitionService)
  protected readonly applicationName = 'ReviewInbox'
}
