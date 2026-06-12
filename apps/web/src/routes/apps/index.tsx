import { useServerFn } from "@tanstack/react-start"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useState, useTransition } from "react"
import type { FormEvent } from "react"

import { canCreateApp } from "../../apps/app-policy.js"
import { createApp, listApps, type CreateAppResult } from "../../apps/app-server-functions.js"
import { isOrganizationAccessFailureStatus } from "../../auth/organization-access.js"
import { ProtectedRouteMessage } from "../../auth/protected-route-message.js"

export const Route = createFileRoute("/apps/")({
  loader: async () => listApps(),
  component: AppsPage,
})

function AppsPage() {
  const initialResult = Route.useLoaderData()
  const router = useRouter()
  const createAppFn = useServerFn(createApp)
  const [result, setResult] = useState<CreateAppResult | null>(null)
  const [isPending, startTransition] = useTransition()

  if (initialResult.status !== "ok") {
    return <ProtectedRouteMessage title="Apps" status={initialResult.status} />
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    startTransition(async () => {
      const nextResult = await createAppFn({ data: { name: formData.get("name") } })
      setResult(nextResult)

      if (nextResult.status === "created") {
        form.reset()
        await router.invalidate()
      }
    })
  }

  return (
    <main>
      <p>
        <Link to="/">ReviewInbox</Link>
      </p>
      <h1>Apps</h1>
      <p>
        Organization: {initialResult.organization.name} ({initialResult.organization.memberRole})
      </p>

      {canCreateApp({ memberRole: initialResult.organization.memberRole }) ? (
        <section>
          <h2>Create App</h2>
          <form onSubmit={onSubmit}>
            <p>
              <label>
                App name
                <br />
                <input name="name" required maxLength={100} />
              </label>
            </p>
            <button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create App"}
            </button>
          </form>
          {result?.status === "validation-error" ? <p role="alert">{result.message}</p> : null}
          {result?.status === "created" ? <p>Created {result.app.name}.</p> : null}
          {result && isOrganizationAccessFailureStatus(result.status) ? (
            <p role="alert">Your Organization access changed. Refresh and try again.</p>
          ) : null}
        </section>
      ) : (
        <p>Only Owners and admins can create Apps for this Organization.</p>
      )}

      <section>
        <h2>Tracked Apps</h2>
        {initialResult.apps.length === 0 ? (
          <p>No Apps yet. Create the first App for this Organization.</p>
        ) : (
          <ul>
            {initialResult.apps.map((app) => (
              <li key={app.id}>
                <strong>{app.name}</strong> · Default reply language: {app.defaultReplyLanguage} ·
                Auto drafts: {app.autoDraftReplies ? "on" : "off"} ·{" "}
                <Link to="/apps/$appId/store-connections" params={{ appId: app.id }}>
                  Store Connections
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
