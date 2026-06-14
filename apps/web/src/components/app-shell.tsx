import { Button } from "@reviewinbox/ui/button"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { cn } from "@reviewinbox/ui"

type OrganizationSummary = {
  name: string
  memberRole: string
}

type AppSummary = {
  id?: string
  name: string
}

type AppShellProps = {
  organization?: OrganizationSummary
  activeApp?: AppSummary
  children: ReactNode
}

type AppPageProps = {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  detail?: ReactNode
}

type PanelProps = {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

type FieldProps = {
  label: string
  children: ReactNode
  hint?: string
}

export function AppShell({ organization, activeApp, children }: AppShellProps) {
  const appNavigation = activeApp?.id
    ? [
        { label: "Reply Inbox", href: `/apps/${activeApp.id}/reply-inbox`, active: false },
        { label: "Reviews", href: `/apps/${activeApp.id}/reviews`, active: false },
        { label: "Reply Context", href: `/apps/${activeApp.id}/reply-context`, active: false },
        {
          label: "Store Connections",
          href: `/apps/${activeApp.id}/store-connections`,
          active: true,
        },
        { label: "Weekly Digest", href: `/apps/${activeApp.id}/weekly-digest`, active: false },
      ]
    : []

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface-3 focus:px-3 focus:py-2 focus:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <div className="grid min-h-dvh lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-background/95 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col gap-6 p-4 lg:p-5">
            <div className="flex items-center justify-between gap-3">
              <Link to="/apps" className="text-sm font-semibold tracking-[-0.02em]">
                ReviewInbox
              </Link>
              <span className="rounded-full border border-border bg-surface-1 px-2 py-1 text-[11px] text-muted-foreground">
                SaaS
              </span>
            </div>

            <div className="rounded-xl border border-border bg-surface-1 p-3">
              <p className="text-xs text-muted">Organization</p>
              <p className="mt-1 truncate text-sm font-medium">
                {organization?.name ?? "No Organization"}
              </p>
              {organization ? (
                <p className="mt-1 text-xs text-muted-foreground">{organization.memberRole}</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-xs text-muted">Active App</p>
              <p className="mt-1 truncate text-base font-semibold tracking-[-0.02em]">
                {activeApp?.name ?? "Select an App"}
              </p>
              <Link
                to="/apps"
                className="mt-3 inline-flex text-xs font-medium text-primary hover:text-primary/80"
              >
                Manage Apps
              </Link>
            </div>

            <nav className="space-y-6" aria-label="Product navigation">
              <NavSection title="App Workflow">
                {appNavigation.length > 0 ? (
                  appNavigation.map((item) => (
                    <a
                      key={item.label}
                      href={item.href}
                      aria-current={item.active ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        item.active
                          ? "bg-surface-2 text-foreground"
                          : "text-muted-foreground hover:bg-surface-1 hover:text-foreground",
                      )}
                    >
                      {item.label}
                      {item.active ? (
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
                      ) : null}
                    </a>
                  ))
                ) : (
                  <p className="px-3 text-sm text-muted">Create an App to unlock workflows.</p>
                )}
              </NavSection>

              <NavSection title="Organization">
                <Link
                  to="/apps"
                  className="block rounded-lg bg-surface-2 px-3 py-2 text-sm text-foreground"
                >
                  Apps
                </Link>
                <span className="block rounded-lg px-3 py-2 text-sm text-muted">Members</span>
                <span className="block rounded-lg px-3 py-2 text-sm text-muted">AI Settings</span>
              </NavSection>
            </nav>

            <div className="mt-auto rounded-xl border border-border bg-surface-1 p-3 text-xs text-muted-foreground">
              Reply workflows stay human-approved before publishing.
            </div>
          </div>
        </aside>

        {children}
      </div>
    </div>
  )
}

export function AppPage({ eyebrow, title, description, actions, children, detail }: AppPageProps) {
  return (
    <main id="main-content" className="min-w-0">
      <div className="grid min-h-dvh xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                {eyebrow ? (
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                    {eyebrow}
                  </p>
                ) : null}
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                ) : null}
              </div>
              {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
            </div>
            {children}
          </div>
        </section>

        {detail ? (
          <aside className="border-t border-border bg-surface-1/60 p-4 sm:p-6 lg:p-8 xl:border-l xl:border-t-0">
            <div className="sticky top-8">{detail}</div>
          </aside>
        ) : null}
      </div>
    </main>
  )
}

export function Panel({ title, description, actions, children, className }: PanelProps) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface-1 p-5", className)}>
      {title || description || actions ? (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title ? <h2 className="text-lg font-semibold tracking-[-0.02em]">{title}</h2> : null}
            {description ? (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block text-sm font-medium text-foreground">
      <span>{label}</span>
      <span className="mt-2 block">{children}</span>
      {hint ? <span className="mt-1 block text-xs font-normal text-muted">{hint}</span> : null}
    </label>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background/50 p-8 text-center">
      <h3 className="text-base font-semibold tracking-[-0.02em]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "primary" | "success"
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "primary" && "border-primary/40 bg-primary/10 text-primary",
        tone === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        tone === "neutral" && "border-border bg-surface-2 text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}

export const fieldControlClassName =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-ring disabled:opacity-60"

export const textareaControlClassName = cn(fieldControlClassName, "min-h-28 resize-y")

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-3 text-xs font-medium uppercase tracking-[0.14em] text-muted">
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

export { Button }
