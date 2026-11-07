/*
 * Leaflet plugins, always imported through this file.
 *
 * leaflet-routing-machine and leaflet.heat are old-style scripts that attach
 * themselves to the global `L`. The bundler runs them as soon as their chunk
 * loads, so Leaflet must be loaded first: ES modules are evaluated in import
 * order, so ./leaflet-global runs before the plugins below.
 *
 * Usage:  import * as L from 'leaflet';
 *         import '../shared/leaflet/leaflet-plugins';
 */
import './leaflet-global';
import 'leaflet-routing-machine'; // adds L.Routing
import 'leaflet.heat'; // adds L.heatLayer
