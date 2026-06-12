import { Link } from "@tanstack/react-router"

import type { OrganizationAccessFailureStatus } from "./organization-access.js"

export function ProtectedRouteMessage(props: {
  title: string
  status: OrganizationAccessFailureStatus
}) {
  const message = {
    unauthenticated: "Sign in before continuing.",
    "missing-active-organization": "Select an active Organization before continuing.",
    forbidden: "You are not a member of the active Organization.",
  }[props.status]

  return (
    <main>
      <h1>{props.title}</h1>
      <p>{message}</p>
      <p>
        <Link to="/">Back to ReviewInbox</Link>
      </p>
    </main>
  )
}
