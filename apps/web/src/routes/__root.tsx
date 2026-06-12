import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"

export const Route = createRootRoute({
  component: Root,
})

function Root() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
