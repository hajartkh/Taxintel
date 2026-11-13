import { atTime } from '../../shared/utils/time';
import { BusyArea, CityEvent } from '../../core/city-data/city.models';
import { Hotspot } from '../models/home.models';
import { clusterHotspots, computeHotspots, demandLevel, eventIntensity, eventsOnDay, peakPickupTime } from './demand-model';

const day = new Date(2026, 9, 30); // Friday 30 October 2026
const venue = { id: 'sportpaleis', name: 'Sportpaleis', lat: 51.2297, lng: 4.4415 };
const concert: CityEvent = {
  id: 1,
  name: 'Concert',
  venue,
  category: 'concert',
  attendance: 15000,
  start: atTime(day, '20:00'),
  end: atTime(day, '23:00'),
};
const station: BusyArea = { id: 'centraal', name: 'Centraal', lat: 51.2172, lng: 4.421, kind: 'station', weight: 0.8, spread: 260 };

describe('demand model', () => {
  it('peaks when the event lets out', () => {
    const atStart = eventIntensity(concert, atTime(day, '20:00'));
    const atPeak = eventIntensity(concert, peakPickupTime(concert));
    expect(atPeak).toBeGreaterThan(atStart);
    expect(demandLevel(atPeak)).toBe('high');
  });

  it('ignores events that are far away in time', () => {
    const spots = computeHotspots(atTime(day, '09:00'), [], [concert]);
    expect(spots.length).toBe(0);
  });

  it('includes busy areas and current events', () => {
    const spots = computeHotspots(atTime(day, '23:15'), [station], [concert]);
    expect(spots.map((s) => s.id)).toEqual(['centraal', 'ev1']);
  });

  it('merges hotspots that are close together', () => {
    const near: Hotspot = { id: 'a', name: 'A', lat: 51.2297, lng: 4.4415, spread: 200, intensity: 0.5, reason: { key: 'reason.station' } };
    const alsoNear = { ...near, id: 'b', lng: 4.4425, intensity: 0.4 };
    const far = { ...near, id: 'c', lat: 51.2, intensity: 0.9 };
    const clusters = clusterHotspots([near, alsoNear, far]);
    expect(clusters.map((c) => c.id)).toEqual(['c', 'a']);
  });

  it('lists the events of one day in start order', () => {
    const early = { ...concert, id: 2, start: atTime(day, '18:00') };
    const otherDay = { ...concert, id: 3, start: atTime(new Date(2026, 9, 31), '20:00') };
    expect(eventsOnDay([concert, otherDay, early], day).map((e) => e.id)).toEqual([2, 1]);
  });
});
