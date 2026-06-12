import { deploymentCapabilitiesFor } from "@reviewinbox/config"
import { createFileRoute, Link } from "@tanstack/react-router"

const capabilities = deploymentCapabilitiesFor("self-hosted")

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  return (
    <main>
      <h1>ReviewInbox</h1>
      <p>Deployment Mode: {capabilities.mode}</p>
      <p>
        <Link to="/onboarding/first-owner">Create the first Owner</Link>
      </p>
      <p>
        <Link to="/apps">Manage Apps</Link>
      </p>
    </main>
  )
}
