import { Component } from '@angular/core'
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { ButtonModule } from 'primeng/button'
import { ThemeToggleComponent } from '../shared/components/theme-toggle/theme-toggle.component'

type ShellNavItem = {
  label: string
  route: string
  icon: string
}

@Component({
  selector: 'ri-app-shell',
  imports: [ButtonModule, RouterLink, RouterLinkActive, RouterOutlet, ThemeToggleComponent],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css',
})
export class AppShellComponent {
  protected readonly navItems: ShellNavItem[] = [
    {
      label: 'Reply Inbox',
      route: '/',
      icon: 'pi-inbox',
    },
    {
      label: 'Apps',
      route: '/apps',
      icon: 'pi-mobile',
    },
    {
      label: 'Settings',
      route: '/settings',
      icon: 'pi-cog',
    },
  ]
}
