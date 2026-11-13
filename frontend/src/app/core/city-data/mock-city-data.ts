/*
 * DUMMY DATA for the driver home page.
 * Will be replaced by backend data (see CityDataService):
 *   events      -> /api/events      (UiTdatabank, Ticketmaster, AllEvents)
 *   busy areas  -> /irail/crowding  (iRail, De Lijn)
 * Event dates are generated relative to today, so the demo never goes stale.
 */
import { addDays, atTime } from '../../shared/utils/time';
import { BusyArea, CityEvent, EventCategory, Venue } from './city.models';

type VenueId =
  | 'sportpaleis' | 'lotto' | 'bosuil' | 'olympisch' | 'schouwburg' | 'elisabeth' | 'opera'
  | 'desingel' | 'trix' | 'ampere' | 'expo' | 'mas' | 'kinepolis';

export const MOCK_VENUES: Record<VenueId, Venue> = {
  sportpaleis: { id: 'sportpaleis', name: 'Sportpaleis', lat: 51.2297, lng: 4.4415 },
  lotto: { id: 'lotto', name: 'Lotto Arena', lat: 51.2322, lng: 4.4455 },
  bosuil: { id: 'bosuil', name: 'Bosuilstadion', lat: 51.2316, lng: 4.4728 },
  olympisch: { id: 'olympisch', name: 'Olympisch Stadion', lat: 51.1868, lng: 4.396 },
  schouwburg: { id: 'schouwburg', name: 'Stadsschouwburg', lat: 51.2148, lng: 4.4071 },
  elisabeth: { id: 'elisabeth', name: 'Koningin Elisabethzaal', lat: 51.2161, lng: 4.4228 },
  opera: { id: 'opera', name: 'Opera Antwerpen', lat: 51.2163, lng: 4.4137 },
  desingel: { id: 'desingel', name: 'deSingel', lat: 51.1937, lng: 4.4082 },
  trix: { id: 'trix', name: 'Trix', lat: 51.2228, lng: 4.443 },
  ampere: { id: 'ampere', name: 'Ampere', lat: 51.2147, lng: 4.419 },
  expo: { id: 'expo', name: 'Antwerp Expo', lat: 51.1898, lng: 4.3905 },
  mas: { id: 'mas', name: 'MAS · Eilandje', lat: 51.2289, lng: 4.4049 },
  kinepolis: { id: 'kinepolis', name: 'Kinepolis', lat: 51.2462, lng: 4.4196 },
};

type EventRow = [dayOffset: number, start: string, end: string, name: string, venue: VenueId, category: EventCategory, attendance: number];

const EVENT_ROWS: EventRow[] = [
  [0, '18:30', '21:30', 'Comedy night: Stand-up Live', 'elisabeth', 'culture', 1900],
  [0, '20:00', '23:00', 'Night Lights Tour', 'sportpaleis', 'concert', 18000],
  [0, '20:45', '22:45', 'Royal Antwerp FC – KRC Genk', 'bosuil', 'sports', 15500],
  [0, '20:00', '22:30', 'Musical: Harbour Lights', 'schouwburg', 'culture', 2000],
  [0, '23:00', '05:00', 'Club night: Techno Friday', 'ampere', 'nightlife', 1200],
  [1, '14:00', '18:00', 'Antwerp Comic Fair', 'expo', 'fair', 9000],
  [1, '19:30', '22:00', 'Antwerp Symphony Orchestra', 'elisabeth', 'culture', 1900],
  [1, '20:00', '23:30', 'Indie Rock Night', 'trix', 'concert', 1500],
  [1, '21:00', '00:30', 'Urban Beats Festival', 'lotto', 'concert', 6500],
  [1, '22:00', '04:00', 'Harbour Party', 'mas', 'nightlife', 3000],
  [2, '13:30', '15:30', 'Beerschot – Standard Luik', 'olympisch', 'sports', 9500],
  [2, '15:00', '17:30', 'Family Ice Show', 'sportpaleis', 'culture', 10000],
  [2, '20:00', '22:00', 'Premiere night', 'kinepolis', 'culture', 2500],
  [3, '19:30', '22:00', 'Opera: Tosca', 'opera', 'culture', 1000],
  [3, '20:00', '22:00', 'Jazz at deSingel', 'desingel', 'concert', 900],
  [4, '20:00', '23:00', 'Rock Legends Live', 'sportpaleis', 'concert', 17000],
  [4, '20:30', '22:30', 'Antwerp Giants – Oostende', 'lotto', 'sports', 5000],
  [5, '10:00', '18:00', 'Trade fair: BuildExpo', 'expo', 'fair', 12000],
  [5, '20:00', '22:30', 'Ballet: Swan Lake', 'opera', 'culture', 1000],
  [6, '20:30', '22:30', 'Royal Antwerp FC – Anderlecht', 'bosuil', 'sports', 16000],
  [6, '21:00', '02:00', 'Rooftop Session', 'mas', 'nightlife', 2500],
  [7, '20:00', '23:00', 'Pop Diva World Tour', 'sportpaleis', 'concert', 18000],
  [8, '19:30', '22:00', 'Theatre: De Storm', 'schouwburg', 'culture', 1800],
  [9, '20:00', '23:00', 'Metal Mayhem', 'trix', 'concert', 1500],
  [10, '20:00', '22:30', 'Symphonic Movie Night', 'elisabeth', 'culture', 1900],
  [11, '18:00', '20:00', 'Beerschot – Club Brugge', 'olympisch', 'sports', 11000],
  [12, '20:00', '23:30', 'Hip-Hop Allstars', 'sportpaleis', 'concert', 16000],
  [13, '14:00', '18:00', 'Christmas Market Opening', 'mas', 'fair', 7000],
];

/** Builds the dummy events for the two weeks starting at `today` (midnight). */
export function buildMockEvents(today: Date): CityEvent[] {
  return EVENT_ROWS.map(([dayOffset, start, end, name, venueId, category, attendance], id) => {
    const day = addDays(today, dayOffset);
    const startsAt = atTime(day, start);
    let endsAt = atTime(day, end);
    if (endsAt <= startsAt) endsAt = addDays(endsAt, 1); // runs past midnight
    return { id, name, venue: MOCK_VENUES[venueId], category, attendance, start: startsAt, end: endsAt };
  });
}

export const MOCK_BUSY_AREAS: BusyArea[] = [
  { id: 'centraal', name: 'Centraal', lat: 51.2172, lng: 4.421, kind: 'station', weight: 0.8, spread: 260 },
  { id: 'berchem', name: 'Berchem', lat: 51.1993, lng: 4.4327, kind: 'station', weight: 0.45, spread: 200 },
  { id: 'oudestad', name: 'Oude Stad', lat: 51.2205, lng: 4.4005, kind: 'nightlife', weight: 0.6, spread: 300 },
  { id: 'zuid', name: 'Zuid', lat: 51.2085, lng: 4.396, kind: 'nightlife', weight: 0.5, spread: 280 },
  { id: 'eilandje', name: 'Eilandje', lat: 51.2295, lng: 4.4065, kind: 'nightlife', weight: 0.4, spread: 260 },
  { id: 'meir', name: 'Meir', lat: 51.2183, lng: 4.41, kind: 'shopping', weight: 0.55, spread: 240 },
];
