/** Settings for the driver home page. */
export const HOME_CONFIG = {
  /** OSRM server for street routing (same as the route finder). */
  osrmUrl: 'https://router.project-osrm.org/route/v1',
  mapCenter: { lat: 51.2155, lng: 4.4205 },
  mapZoom: 13,
  /** Dummy GPS position of the driver until real location is used. */
  driverStart: { lat: 51.2108, lng: 4.4128 },
  /** Used to estimate the drive time of a route. */
  avgCitySpeedKmh: 30,
  /** Maximum number of hotspots in a recommended route. */
  maxStops: 3,
  /** The forecast slider covers one "taxi night": 06:00 of the selected day until 05:30 the next morning. */
  shiftStartHour: 6,
  forecastSlots: 48,
  /** Simulated driving speeds (km/h); the higher ones are for demos. */
  speedOptions: [50, 100, 300, 1000],
} as const;
