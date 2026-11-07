import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { MapLayer } from '../../models/home.models';
import { HomeStore } from '../../state/home.store';

/** Search · locate · layer filter · fullscreen, top left on the map. */
@Component({
  selector: 'app-map-toolbar',
  standalone: true,
  templateUrl: './map-toolbar.component.html',
  styleUrl: './map-toolbar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'onDocumentClick($event)' },
})
export class MapToolbarComponent {
  readonly store = inject(HomeStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  readonly fullscreen = input(false);
  readonly search = output<string>();
  readonly locate = output<void>();
  readonly fullscreenToggle = output<void>();

  readonly searchOpen = signal(false);
  readonly filterOpen = signal(false);

  readonly layerOptions: ReadonlyArray<{ key: MapLayer; label: string }> = [
    { key: 'heat', label: 'Heatmap' },
    { key: 'events', label: 'Events' },
    { key: 'route', label: 'Recommended route' },
  ];

  /** First press opens the field; pressing again searches (or closes it when empty). */
  onSearchButton(): void {
    if (!this.searchOpen()) {
      this.searchOpen.set(true);
      setTimeout(() => this.searchInput().nativeElement.focus(), 150);
    } else if (this.searchInput().nativeElement.value.trim()) {
      this.submitSearch();
    } else {
      this.closeSearch();
    }
  }

  submitSearch(): void {
    const query = this.searchInput().nativeElement.value.trim();
    if (query) this.search.emit(query);
  }

  closeSearch(): void {
    const input = this.searchInput().nativeElement;
    input.value = '';
    input.blur();
    this.searchOpen.set(false);
  }

  onSearchBlur(): void {
    setTimeout(() => {
      const input = this.searchInput().nativeElement;
      if (!input.value.trim() && document.activeElement !== input) this.searchOpen.set(false);
    }, 200);
  }

  onDocumentClick(event: MouseEvent): void {
    if (this.filterOpen() && !this.host.nativeElement.contains(event.target as Node)) this.filterOpen.set(false);
  }
}
