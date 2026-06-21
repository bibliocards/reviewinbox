import { Component, computed, inject } from '@angular/core'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import {
  OrganizationCreateFormComponent,
  type SelectedPlan,
} from '../../shared/components/organization-create-form/organization-create-form.component'
import { ThemeToggleComponent } from '../../shared/components/theme-toggle/theme-toggle.component'

@Component({
  selector: 'ri-organizations-new-page',
  imports: [OrganizationCreateFormComponent, RouterLink, ThemeToggleComponent],
  templateUrl: './organizations-new.page.html',
})
export class OrganizationsNewPageComponent {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)

  protected readonly selectedPlan = computed(() => this.parseSelectedPlan(this.route.snapshot.queryParamMap.get('plan')))
  protected readonly selectedPlanLabel = computed(() => planLabels[this.selectedPlan()])

  protected continueAfterCreate(event: { organizationId: string; selectedPlan: SelectedPlan }): void {
    if (event.selectedPlan === 'free') {
      void this.router.navigateByUrl('/apps')
      return
    }

    void this.router.navigate(['/organization/usage'], {
      queryParams: { plan: event.selectedPlan, checkout: 'pending' },
    })
  }

  private parseSelectedPlan(plan: string | null): SelectedPlan {
    if (plan === 'starter' || plan === 'pro' || plan === 'business') {
      return plan
    }

    return 'free'
  }
}

const planLabels: Record<SelectedPlan, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  business: 'Business',
}
