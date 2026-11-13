import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

export interface MonthChip {
  id: string;
  label: string;
  /** event = city event, high = city event with high demand, own = own agenda item */
  kind: 'event' | 'high' | 'own';
}

export interface MonthCell {
  date: Date;
  day: number;
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  chips: MonthChip[];
  more: number;
  ariaLabel: string;
}

/** 6 × 7 month grid. On small screens the chips become coloured dots. */
@Component({
  selector: 'app-month-grid',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './month-grid.component.html',
  styleUrl: './month-grid.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthGridComponent {
  readonly weekdays = input.required<string[]>();
  readonly cells = input.required<MonthCell[]>();
  readonly daySelected = output<Date>();
}
