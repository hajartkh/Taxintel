import { TestBed } from '@angular/core/testing';
import { daysBetween, startOfDay } from '../../shared/utils/time';
import { HomeStore } from './home.store';

describe('HomeStore week strip', () => {
  let store: HomeStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [HomeStore] });
    store = TestBed.inject(HomeStore);
  });

  it('starts with today followed by the next six days', () => {
    expect(store.weekOffset()).toBe(0);
    expect(store.stripStart().getTime()).toBe(startOfDay(new Date()).getTime());
  });

  it('pages to the following weeks, which always start on Monday', () => {
    store.shiftWeek(1);
    const first = store.stripStart();
    expect(first.getDay()).toBe(1); // Monday
    const fromToday = daysBetween(new Date(), first);
    expect(fromToday).toBeGreaterThanOrEqual(1);
    expect(fromToday).toBeLessThanOrEqual(7);
    expect(store.day().getTime()).toBe(first.getTime()); // first day of the page is selected

    store.shiftWeek(1);
    expect(daysBetween(first, store.stripStart())).toBe(7);
  });

  it('goes back to the week of today, and no further', () => {
    store.shiftWeek(1);
    store.shiftWeek(-1);
    expect(store.stripStart().getTime()).toBe(startOfDay(new Date()).getTime());
    store.shiftWeek(-1);
    expect(store.weekOffset()).toBe(0);
  });
});
