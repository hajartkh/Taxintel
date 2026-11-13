import { ChangeDetectionStrategy, Component, OnInit, inject, input, output } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { NewAgendaItem } from '../../core/agenda/agenda.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { atTime, fromDateInputValue, toDateInputValue } from '../../shared/utils/time';

/** The end time (if filled in) must come after the start time. */
const endAfterStart: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const start = group.get('start')?.value as string;
  const end = group.get('end')?.value as string;
  return start && end && end <= start ? { endBeforeStart: true } : null;
};

/** Form to add an item to the driver's own agenda. */
@Component({
  selector: 'app-agenda-form',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './agenda-form.component.html',
  styleUrl: './agenda-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);

  /** Day the form starts on. */
  readonly day = input.required<Date>();
  readonly saved = output<NewAgendaItem>();
  readonly cancelled = output<void>();

  readonly form = this.fb.nonNullable.group(
    {
      title: ['', [Validators.required, Validators.maxLength(80)]],
      date: ['', Validators.required],
      start: ['09:00', Validators.required],
      end: [''],
      location: ['', Validators.maxLength(80)],
      note: ['', Validators.maxLength(300)],
    },
    { validators: endAfterStart },
  );

  ngOnInit(): void {
    this.form.controls.date.setValue(toDateInputValue(this.day()));
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { title, date, start, end, location, note } = this.form.getRawValue();
    const day = fromDateInputValue(date);
    this.saved.emit({
      title: title.trim(),
      start: atTime(day, start),
      end: end ? atTime(day, end) : undefined,
      location: location.trim() || undefined,
      note: note.trim() || undefined,
    });
  }
}
