import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, output, viewChild } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { I18nService } from '../../../core/i18n/i18n.service';
import { toIsoDate } from '../../../shared/utils/time';
import { AgendaService } from '../../agenda.service';

/** "Until" must be later than "From" when both are filled in. */
function endAfterStart(group: AbstractControl): ValidationErrors | null {
  const { start, end } = group.value as { start: string; end: string };
  return start && end && end <= start ? { endBeforeStart: true } : null;
}

/** Form to add an item to the driver's own agenda. The date follows the selected day. */
@Component({
  selector: 'app-agenda-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './agenda-form.component.html',
  styleUrl: './agenda-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaFormComponent {
  private readonly agenda = inject(AgendaService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly titleInput = viewChild.required<ElementRef<HTMLInputElement>>('titleInput');
  readonly t = inject(I18nService).t;

  readonly date = input.required<Date>();
  /** Date ("2026-11-19") of the item that was just added. */
  readonly added = output<string>();

  readonly form = inject(FormBuilder).nonNullable.group(
    {
      title: ['', [Validators.required, Validators.maxLength(80)]],
      date: ['', Validators.required],
      start: [''],
      end: [''],
      note: ['', Validators.maxLength(200)],
    },
    { validators: endAfterStart },
  );

  constructor() {
    // Selecting another day in the calendar fills in that date.
    effect(() => this.form.controls.date.setValue(toIsoDate(this.date())));
  }

  focus(): void {
    this.host.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    this.titleInput().nativeElement.focus({ preventScroll: true });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { title, date, start, end, note } = this.form.getRawValue();
    this.agenda.add({
      title: title.trim(),
      date,
      start: start || undefined,
      end: start && end ? end : undefined,
      note: note.trim() || undefined,
    });
    this.form.reset({ title: '', date, start: '', end: '', note: '' });
    this.added.emit(date);
  }
}
