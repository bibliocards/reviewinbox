import { Button, buttonVariants, Field, FieldLabel, Input } from "@reviewinbox/ui"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="grid min-h-dvh lg:grid-cols-2">
        <section className="relative hidden overflow-hidden border-r border-border bg-surface-1 lg:block">
          <div className="absolute left-14 top-14 flex items-center gap-4">
            <span className="text-2xl font-semibold tracking-[-0.04em]">ReviewInbox</span>
          </div>

          <div className="absolute bottom-14 left-14 right-14 space-y-4">
            <p className="max-w-xl text-2xl font-medium leading-tight tracking-[-0.04em]">
              “Turn app store reviews into reply workflows.”
            </p>
          </div>
        </section>

        <section className="flex min-h-dvh items-center justify-center px-6 py-10">
          <div className="w-full max-w-md">
            <div className="mb-10 flex flex-col items-center text-center lg:hidden">
              <div className="mb-4 flex items-center gap-3">
                <span className="text-2xl font-semibold tracking-[-0.04em]">ReviewInbox</span>
              </div>
            </div>

            <div className="mb-8 flex flex-col items-center text-center">
              <h1 className="text-3xl font-semibold tracking-[-0.05em]">Sign in</h1>
              <p className="mt-3 text-base text-muted-foreground">
                Enter your email and password to open ReviewInbox.
              </p>
            </div>

            <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" placeholder="john@example.com" />
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                />
              </Field>

              <Button type="submit" className={buttonVariants({ size: "lg", fluid: "long" })}>
                Open Apps
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
