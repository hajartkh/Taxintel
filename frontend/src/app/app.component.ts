import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RouteFinderComponent } from './route-finder/route-finder.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouteFinderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'frontend';
}