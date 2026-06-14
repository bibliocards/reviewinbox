import { Button } from "@reviewinbox/ui/button"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/onboarding/first-owner")({
  component: FirstOwnerOnboarding,
})

function FirstOwnerOnboarding() {
  return (
    <main>
      <h1>Create the first Owner</h1>
      <p>
        Self-hosted ReviewInbox creates one default Organization for the first Owner. After that,
        public signup is closed unless explicitly enabled later.
      </p>
      <form method="post" action="/api/onboarding/first-owner">
        <p>
          <label>
            Name
            <br />
            <input name="name" autoComplete="name" required />
          </label>
        </p>
        <p>
          <label>
            Email
            <br />
            <input name="email" type="email" autoComplete="email" required />
          </label>
        </p>
        <p>
          <label>
            Password
            <br />
            <input name="password" type="password" autoComplete="new-password" required />
          </label>
        </p>
        <Button type="submit">Create Owner</Button>
      </form>
    </main>
  )
}
