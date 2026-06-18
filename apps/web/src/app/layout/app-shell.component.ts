import { DOCUMENT } from "@angular/common"
import { Component, computed, inject, signal } from "@angular/core"
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router"
import { ButtonModule } from "primeng/button"

type ShellNavItem = {
  label: string
  route: string
  icon: string
}

@Component({
  selector: "ri-app-shell",
  imports: [ButtonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: "./app-shell.component.html",
  styleUrl: "./app-shell.component.css",
})
export class AppShellComponent {
  private readonly document = inject(DOCUMENT)

  protected readonly isDarkTheme = signal(false)
  protected readonly themeLabel = computed(() =>
    this.isDarkTheme() ? "Use light theme" : "Use dark theme",
  )
  protected readonly themeIcon = computed(() => (this.isDarkTheme() ? "pi pi-sun" : "pi pi-moon"))

  protected readonly navItems: ShellNavItem[] = [
    {
      label: "Reply Inbox",
      route: "/",
      icon: "pi-inbox",
    },
    {
      label: "Apps",
      route: "/apps",
      icon: "pi-mobile",
    },
    {
      label: "Settings",
      route: "/settings",
      icon: "pi-cog",
    },
  ]

  constructor() {
    const storedTheme = localStorage.getItem("ri-theme")
    const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches ?? false

    this.setTheme(storedTheme ? storedTheme === "dark" : prefersDark, false)
  }

  protected toggleTheme(): void {
    this.setTheme(!this.isDarkTheme())
  }

  private setTheme(isDark: boolean, persist = true): void {
    this.isDarkTheme.set(isDark)
    this.document.documentElement.classList.toggle("dark", isDark)

    if (persist) {
      localStorage.setItem("ri-theme", isDark ? "dark" : "light")
    }
  }
}
