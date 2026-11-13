// Loads Leaflet and makes sure it is available as the global `L`.
// Leaflet 1.x sets window.L itself; the fallback is only there for safety.
import * as Leaflet from 'leaflet';

const scope = globalThis as typeof globalThis & { L?: typeof Leaflet };
scope.L ??= Leaflet;
