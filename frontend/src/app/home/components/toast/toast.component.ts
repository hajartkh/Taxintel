import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';
import { TripService } from '../../services/trip.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    'aria-live': 'polite',
    '[class.show]': 'toast.visible()',
    '[class.raised]': 'trip.active()',
  },
})
export class ToastComponent {
  readonly toast = inject(ToastService);
  readonly trip = inject(TripService);
}
