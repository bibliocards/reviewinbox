import { useServerFn } from "@tanstack/react-start"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useState, useTransition } from "react"
import type { FormEvent } from "react"

import { isOrganizationAccessFailureStatus } from "../../../auth/organization-access.js"
import { ProtectedRouteMessage } from "../../../auth/protected-route-message.js"
import { canManageStoreCredential } from "../../../store-credentials/store-credential-policy.js"
import { canCreateStoreConnection } from "../../../store-connections/store-connection-policy.js"
import {
  createStoreConnection,
  listStoreConnections,
  saveStoreCredential,
  type CreateStoreConnectionResult,
  type SaveStoreCredentialResult,
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
  const saveStoreCredentialFn = useServerFn(saveStoreCredential)
  const [result, setResult] = useState<CreateStoreConnectionResult | null>(null)
  const [storeCredentialResult, setStoreCredentialResult] =
    useState<SaveStoreCredentialResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [savingStoreConnectionId, setSavingStoreConnectionId] = useState<string | null>(null)

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

  async function onStoreCredentialSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const storeConnectionId = String(formData.get("storeConnectionId") ?? "")

    setSavingStoreConnectionId(storeConnectionId)
    startTransition(async () => {
      const nextResult = await saveStoreCredentialFn({
        data: {
          appId,
          storeConnectionId,
          credentialMaterial: formData.get("credentialMaterial"),
        },
      })
      setStoreCredentialResult(nextResult)
      setSavingStoreConnectionId(null)

      if (nextResult.status === "saved") {
        form.reset()
        await router.invalidate()
      }
    })
  }

  const canManageCredentials = canManageStoreCredential({
    memberRole: initialResult.organization.memberRole,
  })

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
                <br />
                Store Credential: {formatStoreCredentialStatus(storeConnection.storeCredential)}
                {canManageCredentials ? (
                  <form onSubmit={onStoreCredentialSubmit}>
                    <input type="hidden" name="storeConnectionId" value={storeConnection.id} />
                    <p>
                      <label>
                        Store Credential
                        <br />
                        <textarea
                          name="credentialMaterial"
                          required
                          rows={4}
                          cols={60}
                          maxLength={20_000}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={credentialPlaceholder(storeConnection.store)}
                        />
                      </label>
                    </p>
                    <button type="submit" disabled={isPending}>
                      {savingStoreConnectionId === storeConnection.id
                        ? "Saving Store Credential..."
                        : storeConnection.storeCredential.configured
                          ? "Update Store Credential"
                          : "Save Store Credential"}
                    </button>
                  </form>
                ) : (
                  <p>Only Owners and admins can create or update Store Credentials.</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {storeCredentialResult?.status === "validation-error" ? (
          <p role="alert">{storeCredentialResult.message}</p>
        ) : null}
        {storeCredentialResult?.status === "configuration-error" ? (
          <p role="alert">{storeCredentialResult.message}</p>
        ) : null}
        {storeCredentialResult?.status === "saved" ? <p>Saved Store Credential.</p> : null}
        {storeCredentialResult?.status === "not-found" ? (
          <p role="alert">Store Connection not found for this App.</p>
        ) : null}
        {storeCredentialResult &&
        isOrganizationAccessFailureStatus(storeCredentialResult.status) ? (
          <p role="alert">Your Organization access changed. Refresh and try again.</p>
        ) : null}
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

function formatStoreCredentialStatus(storeCredential: {
  configured: boolean
  updatedAt?: string
  encryptionAlgorithm?: string
  keyId?: string | null
  keyVersion?: number
}): string {
  if (!storeCredential.configured) {
    return "not configured"
  }

  const keyLabel = storeCredential.keyId
    ? `key ${storeCredential.keyId}`
    : `key v${storeCredential.keyVersion}`
  return `configured, updated ${new Date(storeCredential.updatedAt ?? "").toLocaleString()} (${storeCredential.encryptionAlgorithm}, ${keyLabel})`
}

function credentialPlaceholder(store: string): string {
  if (store === "apple_app_store") {
    return "Paste Apple App Store credential JSON or text"
  }

  if (store === "google_play") {
    return "Paste Google Play credential JSON or text"
  }

  return "Paste Store Credential JSON or text"
}
