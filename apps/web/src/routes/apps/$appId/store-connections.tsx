import { useServerFn } from "@tanstack/react-start"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useState, useTransition } from "react"
import type { FormEvent } from "react"

import { isOrganizationAccessFailureStatus } from "../../../auth/organization-access.js"
import { ProtectedRouteMessage } from "../../../auth/protected-route-message.js"
import {
  AppPage,
  AppShell,
  Button,
  EmptyState,
  Field,
  Panel,
  StatusPill,
  fieldControlClassName,
  textareaControlClassName,
} from "../../../components/app-shell.js"
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

  const canCreateConnection = canCreateStoreConnection({
    memberRole: initialResult.organization.memberRole,
  })

  return (
    <AppShell organization={initialResult.organization} activeApp={initialResult.app}>
      <AppPage
        eyebrow="App workflow"
        title="Store Connections"
        description={`Connect ${initialResult.app.name} to Apple App Store, Google Play, or both. Store Credentials stay encrypted per Store Connection.`}
        detail={
          <Panel
            title="Connection health"
            description="This panel becomes the operational summary for the active App."
          >
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-muted">App</dt>
                <dd className="mt-1 font-medium">{initialResult.app.name}</dd>
              </div>
              <div>
                <dt className="text-muted">Store Connections</dt>
                <dd className="mt-1 font-medium">{initialResult.storeConnections.length}</dd>
              </div>
              <div>
                <dt className="text-muted">Configured Store Credentials</dt>
                <dd className="mt-1 font-medium">
                  {
                    initialResult.storeConnections.filter(
                      (storeConnection) => storeConnection.storeCredential.configured,
                    ).length
                  }
                </dd>
              </div>
            </dl>
          </Panel>
        }
      >
        {canCreateConnection ? (
          <Panel
            title="Create Store Connection"
            description="One App can have one Apple App Store connection and one Google Play connection."
          >
            <form className="grid gap-4 lg:grid-cols-2" onSubmit={onSubmit}>
              <Field label="Store">
                <select className={fieldControlClassName} name="store" required defaultValue="">
                  <option value="" disabled>
                    Select a store
                  </option>
                  <option value="apple_app_store">Apple App Store</option>
                  <option value="google_play">Google Play</option>
                </select>
              </Field>
              <Field label="External App ID">
                <input
                  className={fieldControlClassName}
                  name="externalAppId"
                  required
                  maxLength={200}
                />
              </Field>
              <Field label="Display name" hint="Optional label for humans.">
                <input className={fieldControlClassName} name="displayName" maxLength={100} />
              </Field>
              <label className="flex items-center gap-3 self-end rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <input name="syncEnabled" type="checkbox" defaultChecked />
                Sync enabled
              </label>
              <div className="lg:col-span-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Creating…" : "Create Store Connection"}
                </Button>
              </div>
            </form>
            <CreateConnectionMessage result={result} />
          </Panel>
        ) : (
          <Panel>
            <p className="text-sm text-muted-foreground">
              Only Owners and admins can create Store Connections for this App.
            </p>
          </Panel>
        )}

        <Panel
          title="Store Connections"
          description="Add Store Credentials after creating each connection."
        >
          {initialResult.storeConnections.length === 0 ? (
            <EmptyState
              title="No Store Connections yet"
              description="Create a Store Connection so ReviewInbox can sync Reviews for this App."
            />
          ) : (
            <div className="space-y-4">
              {initialResult.storeConnections.map((storeConnection) => (
                <article
                  key={storeConnection.id}
                  className="rounded-xl border border-border bg-background/50 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold tracking-[-0.02em]">
                          {formatStore(storeConnection.store)}
                        </h3>
                        <StatusPill tone={storeConnection.syncEnabled ? "success" : "neutral"}>
                          Sync {storeConnection.syncEnabled ? "on" : "off"}
                        </StatusPill>
                        <StatusPill
                          tone={storeConnection.storeCredential.configured ? "primary" : "neutral"}
                        >
                          Store Credential{" "}
                          {storeConnection.storeCredential.configured ? "configured" : "missing"}
                        </StatusPill>
                      </div>
                      <p className="mt-1 break-words text-sm text-muted-foreground">
                        External App ID: {storeConnection.externalAppId}
                        {storeConnection.displayName ? ` · ${storeConnection.displayName}` : null}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {formatStoreCredentialStatus(storeConnection.storeCredential)}
                      </p>
                    </div>
                  </div>

                  {canManageCredentials ? (
                    <form className="mt-4 space-y-3" onSubmit={onStoreCredentialSubmit}>
                      <input type="hidden" name="storeConnectionId" value={storeConnection.id} />
                      <Field
                        label="Store Credential"
                        hint="Plaintext is encrypted before it is stored."
                      >
                        <textarea
                          className={textareaControlClassName}
                          name="credentialMaterial"
                          required
                          rows={4}
                          maxLength={20_000}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={credentialPlaceholder(storeConnection.store)}
                        />
                      </Field>
                      <Button type="submit" disabled={isPending} size="sm">
                        {savingStoreConnectionId === storeConnection.id
                          ? "Saving Store Credential…"
                          : storeConnection.storeCredential.configured
                            ? "Update Store Credential"
                            : "Save Store Credential"}
                      </Button>
                    </form>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Only Owners and admins can create or update Store Credentials.
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
          <StoreCredentialMessage result={storeCredentialResult} />
        </Panel>
      </AppPage>
    </AppShell>
  )
}

function CreateConnectionMessage({ result }: { result: CreateStoreConnectionResult | null }) {
  if (!result) {
    return null
  }

  if (result.status === "validation-error") {
    return (
      <p className="mt-3 text-sm text-destructive-foreground" role="alert">
        {result.message}
      </p>
    )
  }

  if (result.status === "created") {
    return (
      <p className="mt-3 text-sm text-muted-foreground" role="status">
        Created Store Connection.
      </p>
    )
  }

  if (result.status === "not-found") {
    return (
      <p className="mt-3 text-sm text-destructive-foreground" role="alert">
        App not found for this Organization.
      </p>
    )
  }

  if (isOrganizationAccessFailureStatus(result.status)) {
    return (
      <p className="mt-3 text-sm text-destructive-foreground" role="alert">
        Your Organization access changed. Refresh and try again.
      </p>
    )
  }

  return null
}

function StoreCredentialMessage({ result }: { result: SaveStoreCredentialResult | null }) {
  if (!result) {
    return null
  }

  if (result.status === "validation-error" || result.status === "configuration-error") {
    return (
      <p className="mt-3 text-sm text-destructive-foreground" role="alert">
        {result.message}
      </p>
    )
  }

  if (result.status === "saved") {
    return (
      <p className="mt-3 text-sm text-muted-foreground" role="status">
        Saved Store Credential.
      </p>
    )
  }

  if (result.status === "not-found") {
    return (
      <p className="mt-3 text-sm text-destructive-foreground" role="alert">
        Store Connection not found for this App.
      </p>
    )
  }

  if (isOrganizationAccessFailureStatus(result.status)) {
    return (
      <p className="mt-3 text-sm text-destructive-foreground" role="alert">
        Your Organization access changed. Refresh and try again.
      </p>
    )
  }

  return null
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
