import { divIcon } from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import useLiveBuses from '../hooks/useLiveBuses';
import useTransitNetwork from '../hooks/useTransitNetwork';
import { estimateRouteStopEtas } from '../lib/eta';
import { isFirebaseConfigured } from '../lib/firebase';

const defaultCenter = [6.9271, 79.8612];

function createBusIcon(busId) {
  return divIcon({
    className: 'bus-marker-icon',
    html: `<span>${busId}</span>`,
    iconSize: [74, 32],
    iconAnchor: [37, 16],
  });
}

function RecenterMap({ center }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom(), {
      animate: true,
    });
  }, [center, map]);

  return null;
}

function formatUpdatedTime(timestamp) {
  if (!timestamp) {
    return 'Waiting for first location';
  }

  return new Date(timestamp).toLocaleTimeString();
}

function formatEta(etaMinutes) {
  if (!Number.isFinite(etaMinutes)) {
    return 'ETA unavailable';
  }

  if (etaMinutes <= 1) {
    return 'Due now';
  }

  return `${etaMinutes} min`;
}

function formatCrowdLevel(crowdLevel) {
  if (!crowdLevel) {
    return 'Unknown';
  }

  return crowdLevel.charAt(0).toUpperCase() + crowdLevel.slice(1);
}

export default function PassengerPage() {
  const { buses, isLoading, error } = useLiveBuses();
  const {
    routes,
    source: routeSource,
    isLoading: isNetworkLoading,
    error: networkError,
  } = useTransitNetwork();
  const [selectedRouteId, setSelectedRouteId] = useState('all');

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

  const visibleRoutes = selectedRoute ? [selectedRoute] : routes;

  const visibleBuses = useMemo(() => {
    if (!selectedRoute) {
      return buses;
    }

    return buses.filter((bus) => bus.routeId === selectedRoute.id);
  }, [buses, selectedRoute]);

  const visibleStops = useMemo(
    () => visibleRoutes.flatMap((route) => route.stops.map((stop) => ({ ...stop, routeId: route.id, color: route.color }))),
    [visibleRoutes],
  );
  const selectedRouteEtas = useMemo(
    () => (selectedRoute ? estimateRouteStopEtas(selectedRoute, visibleBuses) : []),
    [selectedRoute, visibleBuses],
  );

  const [firstBus] = visibleBuses;
  const mapCenter = firstBus
    ? [firstBus.lat, firstBus.lng]
    : selectedRoute?.center ?? routes[0]?.center ?? defaultCenter;

  return (
    <section className="panel-layout">
      <article className="panel panel--map">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Passenger view</p>
            <h2>Live route map</h2>
          </div>
          <div className="status-row">
            <span className="status-pill">{visibleBuses.length} active buses</span>
            <span className="status-pill status-pill--subtle">Realtime Database stream</span>
          </div>
        </div>

        {!isFirebaseConfigured ? (
          <div className="empty-state">
            <h3>Firebase config required</h3>
            <p>
              Copy .env.example to .env and add your Firebase web app credentials before starting the
              map.
            </p>
          </div>
        ) : (
          <>
            <div className="route-toolbar">
              <label className="field field--inline">
                <span>Route</span>
                <select value={selectedRouteId} onChange={(event) => setSelectedRouteId(event.target.value)}>
                  <option value="all">All routes</option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.id} - {route.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="status-row">
                <span className="status-pill status-pill--subtle">{routes.length} routes loaded</span>
                <span className="status-pill status-pill--subtle">Catalog: {routeSource}</span>
              </div>
            </div>

            <div className="map-frame">
              <MapContainer center={mapCenter} zoom={13} scrollWheelZoom className="map-canvas">
                <RecenterMap center={mapCenter} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {visibleRoutes.map((route) => (
                  <Polyline key={route.id} color={route.color} pathOptions={{ weight: 5, opacity: 0.75 }} positions={route.path}>
                    <Popup>
                      <strong>Route {route.id}</strong>
                      <br />
                      {route.name}
                    </Popup>
                  </Polyline>
                ))}

                {visibleStops.map((stop) => (
                  <CircleMarker
                    key={stop.id}
                    center={[stop.lat, stop.lng]}
                    pathOptions={{ color: stop.color, fillColor: '#ffffff', fillOpacity: 1 }}
                    radius={7}
                  >
                    <Popup>
                      <strong>{stop.name}</strong>
                      <br />
                      Route: {stop.routeId}
                    </Popup>
                  </CircleMarker>
                ))}

                {visibleBuses.map((bus) => (
                  <Marker key={bus.busId} icon={createBusIcon(bus.busId)} position={[bus.lat, bus.lng]}>
                    <Popup>
                      <strong>{bus.busId}</strong>
                      <br />
                      Route: {bus.routeId}
                      <br />
                      Speed: {Math.round(bus.speed)} km/h
                      <br />
                      Crowd: {formatCrowdLevel(bus.crowdLevel)}
                      <br />
                      Updated: {formatUpdatedTime(bus.timestamp)}
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>

            {isLoading ? <p className="inline-note">Listening for live bus updates...</p> : null}
            {error ? <p className="inline-note inline-note--error">{error}</p> : null}
            {isNetworkLoading ? <p className="inline-note">Loading route catalog...</p> : null}
            {networkError ? <p className="inline-note inline-note--error">{networkError}</p> : null}
            {!isLoading && !error && visibleBuses.length === 0 ? (
              <p className="inline-note">No buses are publishing on this route yet. Start tracking from the driver console.</p>
            ) : null}
          </>
        )}
      </article>

      <aside className="panel panel--sidebar">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Network status</p>
            <h2>{selectedRoute ? `Route ${selectedRoute.id}` : 'Active fleet'}</h2>
          </div>
        </div>

        {selectedRoute ? (
          <section className="info-card route-summary-card">
            <h3>{selectedRoute.name}</h3>
            <p>
              Stops: {selectedRoute.stops.length}
              <br />
              Registered buses: {selectedRoute.buses.length}
              <br />
              Live buses now: {visibleBuses.length}
              <br />
              Next stop alerts: {selectedRouteEtas.filter((eta) => eta.isSoon).length}
            </p>
          </section>
        ) : null}

        {selectedRoute ? (
          <section className="eta-board">
            {selectedRouteEtas.map((stopEta) => (
              <article className={stopEta.isSoon ? 'eta-card eta-card--soon' : 'eta-card'} key={stopEta.stopId}>
                <div className="bus-card__head">
                  <h3>{stopEta.stopName}</h3>
                  <span>{formatEta(stopEta.nextArrival?.etaMinutes)}</span>
                </div>
                {stopEta.nextArrival ? (
                  <p>
                    Next bus: {stopEta.nextArrival.busId}
                    <br />
                    Distance: {stopEta.nextArrival.remainingDistanceKm} km
                    <br />
                    Crowd: {formatCrowdLevel(stopEta.nextArrival.crowdLevel)}
                  </p>
                ) : (
                  <p>No active bus assigned to this stop right now.</p>
                )}
              </article>
            ))}

            {!selectedRouteEtas.length ? (
              <div className="empty-state empty-state--compact">
                <h3>No ETA data</h3>
                <p>Select a route with live buses to estimate arrivals for each stop.</p>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="route-list">
          {routes.map((route) => (
            <button
              key={route.id}
              className={route.id === selectedRouteId ? 'route-chip route-chip--active' : 'route-chip'}
              onClick={() => setSelectedRouteId(route.id === selectedRouteId ? 'all' : route.id)}
              style={{ '--route-color': route.color }}
              type="button"
            >
              <strong>{route.id}</strong>
              <span>{route.name}</span>
            </button>
          ))}
        </section>

        <div className="bus-list">
          {visibleBuses.map((bus) => {
            const ageInSeconds = Math.max(0, Math.round((Date.now() - bus.timestamp) / 1000));
            const freshnessClass = ageInSeconds <= 10 ? 'bus-card--fresh' : 'bus-card--stale';

            return (
              <article className={`bus-card ${freshnessClass}`} key={bus.busId}>
                <div className="bus-card__head">
                  <h3>{bus.busId}</h3>
                  <span>{bus.routeId}</span>
                </div>
                <p>
                  Driver: {bus.driverId}
                  <br />
                  Speed: {Math.round(bus.speed)} km/h
                  <br />
                  Crowd: {formatCrowdLevel(bus.crowdLevel)}
                  <br />
                  Source: {bus.source}
                </p>
                <p className="bus-card__timestamp">Last update {formatUpdatedTime(bus.timestamp)}</p>
              </article>
            );
          })}

          {!visibleBuses.length ? (
            <div className="empty-state empty-state--compact">
              <h3>No active buses</h3>
              <p>The passenger map will populate as soon as a driver starts publishing updates for the selected route.</p>
            </div>
          ) : null}
        </div>
      </aside>
    </section>
  );
}
