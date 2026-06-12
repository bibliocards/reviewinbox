import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/apps")({
  component: AppsLayout,
})

function AppsLayout() {
  return <Outlet />
}
