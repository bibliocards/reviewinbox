import { useServerFn } from "@tanstack/react-start"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useState, useTransition } from "react"
import type { FormEvent } from "react"

import { canCreateApp } from "../../apps/app-policy.js"
import { createApp, listApps, type CreateAppResult } from "../../apps/app-server-functions.js"
import { isOrganizationAccessFailureStatus } from "../../auth/organization-access.js"
import { ProtectedRouteMessage } from "../../auth/protected-route-message.js"
import {
  AppPage,
  AppShell,
  Button,
  EmptyState,
  Field,
  Panel,
  StatusPill,
  fieldControlClassName,
} from "../../components/app-shell.js"

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

  const canCreate = canCreateApp({ memberRole: initialResult.organization.memberRole })

  return (
    <AppShell organization={initialResult.organization}>
      <AppPage
        eyebrow="Organization"
        title="Apps"
        description="Choose the mobile App you want to work on, then ReviewInbox opens the inbox, Store Connections, Reply Context, and digest workflow around it."
        detail={
          <Panel
            title="App-first workflow"
            description="Each App owns its Reviews, Store Connections, Reply Context, Reply Drafts, and Weekly Digest."
          >
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Create one App per mobile product you track.</p>
              <p>After that, connect Apple App Store or Google Play from the App workflow.</p>
            </div>
          </Panel>
        }
      >
        {canCreate ? (
          <Panel title="Create App" description="Start with the customer-facing mobile App name.">
            <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={onSubmit}>
              <div className="min-w-0 flex-1">
                <Field label="App name">
                  <input className={fieldControlClassName} name="name" required maxLength={100} />
                </Field>
              </div>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating…" : "Create App"}
              </Button>
            </form>
            <ResultMessage result={result} />
          </Panel>
        ) : (
          <Panel>
            <p className="text-sm text-muted-foreground">
              Only Owners and admins can create Apps for this Organization.
            </p>
          </Panel>
        )}

        <Panel
          title="Tracked Apps"
          description="Open an App to configure Store Connections and review workflows."
        >
          {initialResult.apps.length === 0 ? (
            <EmptyState
              title="No Apps yet"
              description="Create the first App for this Organization to unlock the Reply Inbox workflow."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {initialResult.apps.map((app) => (
                <div
                  key={app.id}
                  className="grid gap-4 border-b border-border bg-background/40 p-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold tracking-[-0.02em]">
                        {app.name}
                      </h3>
                      <StatusPill tone={app.autoDraftReplies ? "primary" : "neutral"}>
                        Auto drafts {app.autoDraftReplies ? "on" : "off"}
                      </StatusPill>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Default reply language: {app.defaultReplyLanguage}
                    </p>
                  </div>
                  <Link
                    to="/apps/$appId/store-connections"
                    params={{ appId: app.id }}
                    aria-label={`Open ${app.name} workflow`}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface-1 px-3 text-sm font-medium transition-colors hover:bg-surface-2"
                  >
                    Open workflow
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </AppPage>
    </AppShell>
  )
}

function ResultMessage({ result }: { result: CreateAppResult | null }) {
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
        Created {result.app.name}.
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
