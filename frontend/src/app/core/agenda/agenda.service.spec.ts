import { TestBed } from '@angular/core/testing';
import { atTime } from '../../shared/utils/time';
import { AgendaService } from './agenda.service';

describe('AgendaService', () => {
  const day = new Date(2026, 10, 13);

  beforeEach(() => localStorage.clear());

  it('adds, lists per day (sorted) and removes items', () => {
    const agenda = TestBed.inject(AgendaService);
    const late = agenda.add({ title: 'Late pickup', start: atTime(day, '22:00') });
    agenda.add({ title: 'Airport', start: atTime(day, '07:30'), location: 'Zaventem' });
    agenda.add({ title: 'Other day', start: atTime(new Date(2026, 10, 14), '09:00') });

    expect(agenda.itemsOn(day).map((i) => i.title)).toEqual(['Airport', 'Late pickup']);
    agenda.remove(late.id);
    expect(agenda.itemsOn(day).map((i) => i.title)).toEqual(['Airport']);
  });

  it('remembers items in localStorage', () => {
    TestBed.inject(AgendaService).add({ title: 'Saved', start: atTime(day, '10:00') });
    TestBed.flushEffects();
    const stored = JSON.parse(localStorage.getItem('taxintel.agenda') ?? '[]');
    expect(stored[0].title).toBe('Saved');
  });
});
