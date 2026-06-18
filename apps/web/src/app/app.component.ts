import { Component, signal } from "@angular/core"

@Component({
  selector: "ri-root",
  imports: [],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent {
  protected readonly healthLabel = signal("Check API health")
}
