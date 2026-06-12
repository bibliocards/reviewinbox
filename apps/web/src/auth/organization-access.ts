export type OrganizationAccessFailureStatus =
  | "unauthenticated"
  | "missing-active-organization"
  | "forbidden"

export function isOrganizationAccessFailureStatus(
  status: string,
): status is OrganizationAccessFailureStatus {
  return (
    status === "unauthenticated" ||
    status === "missing-active-organization" ||
    status === "forbidden"
  )
}
