import { useServerFn } from "@tanstack/react-start"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useState, useTransition } from "react"
import type { FormEvent } from "react"

import { isOrganizationAccessFailureStatus } from "../../../auth/organization-access.js"
import { ProtectedRouteMessage } from "../../../auth/protected-route-message.js"
import { canCreateStoreConnection } from "../../../store-connections/store-connection-policy.js"
import {
  createStoreConnection,
  listStoreConnections,
  type CreateStoreConnectionResult,
} from "../../../store-connections/store-connection-server-functions.js"

export const Route = createFileRoute("/apps/$appId/store-connections")({
  loader: async ({ params }) => listStoreConnections({ data: { appId: params.appId } }),
  component: StoreConnectionsPage,
})

function StoreConnectionsPage() {
  const { appId } = Route.useParams()
  const initialResult = Route.useLoaderData()
  const router = useRouter()
  const createStoreConnectionFn = useServerFn(createStoreConnection)
  const [result, setResult] = useState<CreateStoreConnectionResult | null>(null)
  const [isPending, startTransition] = useTransition()

  if (initialResult.status !== "ok") {
    if (isOrganizationAccessFailureStatus(initialResult.status)) {
      return <ProtectedRouteMessage title="Store Connections" status={initialResult.status} />
    }

    return (
      <main>
        <p>
          <Link to="/apps">Apps</Link>
        </p>
        <h1>Store Connections</h1>
        <p role="alert">App not found for this Organization.</p>
      </main>
    )
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    startTransition(async () => {
      const nextResult = await createStoreConnectionFn({
        data: {
          appId,
          store: formData.get("store"),
          externalAppId: formData.get("externalAppId"),
          displayName: formData.get("displayName"),
          syncEnabled: formData.get("syncEnabled"),
        },
      })
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
        <Link to="/apps">Apps</Link>
      </p>
      <h1>Store Connections for {initialResult.app.name}</h1>
      <p>
        Organization: {initialResult.organization.name} ({initialResult.organization.memberRole})
      </p>

      {canCreateStoreConnection({ memberRole: initialResult.organization.memberRole }) ? (
        <section>
          <h2>Create Store Connection</h2>
          <form onSubmit={onSubmit}>
            <p>
              <label>
                Store
                <br />
                <select name="store" required defaultValue="">
                  <option value="" disabled>
                    Select a store
                  </option>
                  <option value="apple_app_store">Apple App Store</option>
                  <option value="google_play">Google Play</option>
                </select>
              </label>
            </p>
            <p>
              <label>
                External App ID
                <br />
                <input name="externalAppId" required maxLength={200} />
              </label>
            </p>
            <p>
              <label>
                Display name
                <br />
                <input name="displayName" maxLength={100} />
              </label>
            </p>
            <p>
              <label>
                <input name="syncEnabled" type="checkbox" defaultChecked /> Sync enabled
              </label>
            </p>
            <button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create Store Connection"}
            </button>
          </form>
          {result?.status === "validation-error" ? <p role="alert">{result.message}</p> : null}
          {result?.status === "created" ? <p>Created Store Connection.</p> : null}
          {result?.status === "not-found" ? (
            <p role="alert">App not found for this Organization.</p>
          ) : null}
          {result && isOrganizationAccessFailureStatus(result.status) ? (
            <p role="alert">Your Organization access changed. Refresh and try again.</p>
          ) : null}
        </section>
      ) : (
        <p>Only Owners and admins can create Store Connections for this App.</p>
      )}

      <section>
        <h2>Store Connections</h2>
        {initialResult.storeConnections.length === 0 ? (
          <p>No Store Connections yet.</p>
        ) : (
          <ul>
            {initialResult.storeConnections.map((storeConnection) => (
              <li key={storeConnection.id}>
                <strong>{formatStore(storeConnection.store)}</strong> · External App ID:{" "}
                {storeConnection.externalAppId} · Sync: {storeConnection.syncEnabled ? "on" : "off"}
                {storeConnection.displayName ? ` · ${storeConnection.displayName}` : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function formatStore(store: string): string {
  if (store === "apple_app_store") {
    return "Apple App Store"
  }

  if (store === "google_play") {
    return "Google Play"
  }

  return store
}
