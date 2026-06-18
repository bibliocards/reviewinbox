import type { Routes } from "@angular/router"
import { AppShellComponent } from "./layout/app-shell.component"
import { AppsPageComponent } from "./pages/apps/apps.page"
import { ReplyInboxPageComponent } from "./pages/reply-inbox/reply-inbox.page"
import { SettingsPageComponent } from "./pages/settings/settings.page"

export const appRoutes: Routes = [
  {
    path: "",
    component: AppShellComponent,
    children: [
      {
        path: "",
        title: "Reply Inbox | ReviewInbox",
        component: ReplyInboxPageComponent,
      },
      {
        path: "apps",
        title: "Apps | ReviewInbox",
        component: AppsPageComponent,
      },
      {
        path: "settings",
        title: "Settings | ReviewInbox",
        component: SettingsPageComponent,
      },
    ],
  },
  {
    path: "**",
    redirectTo: "",
  },
]
