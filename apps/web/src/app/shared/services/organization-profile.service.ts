import { HttpClient, httpResource } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type { DeleteOrganizationResponse, OrganizationProfileResponse, OrganizationUsageResponse } from '@reviewinbox/contracts'
import type { Observable } from 'rxjs'
import { environment } from '../../../environments/environment'
import { resolveOptionalString } from '../../../environments/environment.model'

@Injectable({ providedIn: 'root' })
export class OrganizationProfileService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = resolveOptionalString(environment.apiUrl) ?? ''

  getProfile(): Observable<OrganizationProfileResponse> {
    return this.http.get<OrganizationProfileResponse>(`${this.apiUrl}/api/organization/profile`)
  }

  getUsage(): Observable<OrganizationUsageResponse> {
    return this.http.get<OrganizationUsageResponse>(`${this.apiUrl}/api/organization/usage`)
  }

  usageResource() {
    return httpResource<OrganizationUsageResponse>(() => `${this.apiUrl}/api/organization/usage`)
  }

  updateProfile(input: { name: string }): Observable<OrganizationProfileResponse> {
    return this.http.patch<OrganizationProfileResponse>(`${this.apiUrl}/api/organization/profile`, input)
  }

  uploadLogo(file: File): Observable<OrganizationProfileResponse> {
    const formData = new FormData()
    formData.append('logo', file)

    return this.http.put<OrganizationProfileResponse>(`${this.apiUrl}/api/organization/profile/logo`, formData)
  }

  deleteOrganization(input: { name: string }): Observable<DeleteOrganizationResponse> {
    return this.http.delete<DeleteOrganizationResponse>(`${this.apiUrl}/api/organization`, { body: input })
  }
}
