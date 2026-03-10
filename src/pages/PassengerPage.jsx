import { useMemo, useState } from 'react';
import { CircleF, GoogleMap, InfoWindowF, MarkerF, PolylineF, useJsApiLoader } from '@react-google-maps/api';
import useLiveBuses from '../hooks/useLiveBuses';
import useTransitNetwork from '../hooks/useTransitNetwork';
import { estimateRouteStopEtas } from '../lib/eta';
import { isFirebaseConfigured } from '../lib/firebase';

const defaultCenter = [6.9271, 79.8612];
const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

function buildLatLng(point) {
  return { lat: point[0], lng: point[1] };
}

function createBusMarkerIcon() {
  if (!window.google?.maps) {
    return undefined;
  }

  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor: '#ff5c39',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: 12,
  };
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

function stripHtml(htmlText) {
  return htmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseTransitRoute(route, routeIndex) {
  const firstLeg = route.legs?.[0];
  const steps = (firstLeg?.steps ?? []).map((step, stepIndex) => ({
    id: `${routeIndex}-${stepIndex}`,
    travelMode: step.travel_mode,
    instructions: stripHtml(step.instructions ?? ''),
    distanceText: step.distance?.text ?? '',
    durationText: step.duration?.text ?? '',
    lineName: step.transit?.line?.short_name ?? step.transit?.line?.name ?? '',
    vehicleType: step.transit?.line?.vehicle?.type ?? '',
    headsign: step.transit?.headsign ?? '',
    departureStop: step.transit?.departure_stop?.name ?? '',
    arrivalStop: step.transit?.arrival_stop?.name ?? '',
    departureTime: step.transit?.departure_time?.text ?? '',
    arrivalTime: step.transit?.arrival_time?.text ?? '',
    stopCount: step.transit?.num_stops ?? 0,
  }));

  const busLines = [...new Set(steps.filter((step) => step.lineName).map((step) => step.lineName))];

  return {
    id: `option-${routeIndex}`,
    durationText: firstLeg?.duration?.text ?? '',
    distanceText: firstLeg?.distance?.text ?? '',
    departureTime: firstLeg?.departure_time?.text ?? '',
    arrivalTime: firstLeg?.arrival_time?.text ?? '',
    busLines,
    overviewPath: (route.overview_path ?? []).map((point) => ({
      lat: point.lat(),
      lng: point.lng(),
    })),
    steps,
  };
}

export default function PassengerPage() {
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { buses, isLoading, error } = useLiveBuses();
  const {
    routes,
    source: routeSource,
    isLoading: isNetworkLoading,
    error: networkError,
  } = useTransitNetwork();
  const [selectedRouteId, setSelectedRouteId] = useState('all');
  const [activeOverlay, setActiveOverlay] = useState(null);
  const [tripForm, setTripForm] = useState({
    origin: 'Pettah, Colombo',
    destination: 'Maharagama, Colombo',
  });
  const [tripOptions, setTripOptions] = useState([]);
  const [selectedTripIndex, setSelectedTripIndex] = useState(0);
  const [tripPlannerError, setTripPlannerError] = useState('');
  const [isPlanningTrip, setIsPlanningTrip] = useState(false);
  const isGoogleMapsConfigured = Boolean(googleMapsApiKey);
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'bus-tracking-google-map',
    googleMapsApiKey: googleMapsApiKey ?? '',
  });

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
  const mapCenterObject = useMemo(() => buildLatLng(mapCenter), [mapCenter[0], mapCenter[1]]);
  const selectedTrip = tripOptions[selectedTripIndex] ?? null;

  async function handleTripPlan() {
    if (!window.google?.maps) {
      setTripPlannerError('Google Maps is not loaded yet.');
      return;
    }

    if (!tripForm.origin.trim() || !tripForm.destination.trim()) {
      setTripPlannerError('Origin and destination are required.');
      return;
    }

    setIsPlanningTrip(true);
    setTripPlannerError('');

    try {
      const directionsService = new window.google.maps.DirectionsService();
      const response = await directionsService.route({
        origin: tripForm.origin.trim(),
        destination: tripForm.destination.trim(),
        provideRouteAlternatives: true,
        travelMode: window.google.maps.TravelMode.TRANSIT,
        transitOptions: {
          modes: [window.google.maps.TransitMode.BUS],
        },
      });

      const nextOptions = (response.routes ?? []).map((route, routeIndex) => parseTransitRoute(route, routeIndex));

      if (!nextOptions.length) {
        setTripOptions([]);
        setTripPlannerError('No bus transit directions were returned for this trip.');
        return;
      }

      setTripOptions(nextOptions);
      setSelectedTripIndex(0);
    } catch (nextError) {
      setTripOptions([]);
      setTripPlannerError(nextError.message ?? 'Transit directions request failed.');
    } finally {
      setIsPlanningTrip(false);
    }
  }

  function selectTripOption(tripIndex) {
    setSelectedTripIndex(tripIndex);
  }

  return (
    <section className="panel-layout">
      <article className="panel panel--map">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Passenger view</p>
            <h2>Live route map</h2>
          </div>
          <div className="status-row">
            <span className="status-pill status-pill--live">{visibleBuses.length} active</span>
            <span className="status-pill status-pill--subtle">{routes.length} routes</span>
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
        ) : !isGoogleMapsConfigured ? (
          <div className="empty-state">
            <h3>Google Maps API key required</h3>
            <p>Add `VITE_GOOGLE_MAPS_API_KEY` to `.env` so the passenger map can load Google Maps.</p>
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

              <span className="status-pill status-pill--subtle">Source: {routeSource}</span>
            </div>

            <div className="map-frame">
              <div className="map-canvas">
                {loadError ? (
                  <div className="empty-state empty-state--compact">
                    <h3>Google Maps failed to load</h3>
                    <p>{loadError.message}</p>
                  </div>
                ) : null}

                {!loadError && !isLoaded ? <p className="inline-note">Loading Google Maps...</p> : null}

                {!loadError && isLoaded ? (
                  <GoogleMap
                    center={mapCenterObject}
                    mapContainerStyle={mapContainerStyle}
                    options={{
                      fullscreenControl: true,
                      mapTypeControl: false,
                      streetViewControl: false,
                      zoomControl: true,
                      gestureHandling: 'greedy',
                    }}
                    zoom={13}
                  >
                    {visibleRoutes.map((route) => (
                      <PolylineF
                        key={route.id}
                        onClick={() => setActiveOverlay({ type: 'route', route })}
                        options={{
                          clickable: true,
                          geodesic: false,
                          path: route.path.map((point) => buildLatLng(point)),
                          strokeColor: route.color,
                          strokeOpacity: 0.85,
                          strokeWeight: 5,
                        }}
                      />
                    ))}

                    {selectedTrip?.overviewPath?.length ? (
                      <PolylineF
                        options={{
                          path: selectedTrip.overviewPath,
                          strokeColor: '#0d6efd',
                          strokeOpacity: 0.8,
                          strokeWeight: 6,
                          zIndex: 20,
                        }}
                      />
                    ) : null}

                    {visibleStops.map((stop) => (
                      <CircleF
                        center={{ lat: stop.lat, lng: stop.lng }}
                        key={stop.id}
                        onClick={() => setActiveOverlay({ type: 'stop', stop })}
                        options={{
                          clickable: true,
                          fillColor: '#ffffff',
                          fillOpacity: 1,
                          radius: 55,
                          strokeColor: stop.color,
                          strokeOpacity: 1,
                          strokeWeight: 3,
                        }}
                      />
                    ))}

                    {visibleBuses.map((bus) => (
                      <MarkerF
                        icon={createBusMarkerIcon()}
                        key={bus.busId}
                        label={{
                          color: '#ffffff',
                          fontSize: '10px',
                          fontWeight: '700',
                          text: bus.busId.replace('bus_', '').replaceAll('_', '-'),
                        }}
                        onClick={() => setActiveOverlay({ type: 'bus', bus })}
                        position={{ lat: bus.lat, lng: bus.lng }}
                      />
                    ))}

                    {activeOverlay?.type === 'route' ? (
                      <InfoWindowF
                        onCloseClick={() => setActiveOverlay(null)}
                        position={buildLatLng(activeOverlay.route.center ?? defaultCenter)}
                      >
                        <div className="map-info-window">
                          <strong>Route {activeOverlay.route.id}</strong>
                          <br />
                          {activeOverlay.route.name}
                        </div>
                      </InfoWindowF>
                    ) : null}

                    {activeOverlay?.type === 'stop' ? (
                      <InfoWindowF
                        onCloseClick={() => setActiveOverlay(null)}
                        position={{ lat: activeOverlay.stop.lat, lng: activeOverlay.stop.lng }}
                      >
                        <div className="map-info-window">
                          <strong>{activeOverlay.stop.name}</strong>
                          <br />
                          Route: {activeOverlay.stop.routeId}
                        </div>
                      </InfoWindowF>
                    ) : null}

                    {activeOverlay?.type === 'bus' ? (
                      <InfoWindowF
                        onCloseClick={() => setActiveOverlay(null)}
                        position={{ lat: activeOverlay.bus.lat, lng: activeOverlay.bus.lng }}
                      >
                        <div className="map-info-window">
                          <strong>{activeOverlay.bus.busId}</strong>
                          <br />
                          Route: {activeOverlay.bus.routeId}
                          <br />
                          Speed: {Math.round(activeOverlay.bus.speed)} km/h
                          <br />
                          Crowd: {formatCrowdLevel(activeOverlay.bus.crowdLevel)}
                          <br />
                          Updated: {formatUpdatedTime(activeOverlay.bus.timestamp)}
                        </div>
                      </InfoWindowF>
                    ) : null}
                  </GoogleMap>
                ) : null}
              </div>
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
            <h2>{selectedRoute ? `Route ${selectedRoute.id}` : 'Fleet overview'}</h2>
          </div>
          <span className="status-pill status-pill--live">{visibleBuses.length} live</span>
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

        <p className="section-label">Trip planner</p>

        <section className="info-card route-summary-card">
          <div className="planner-grid">
            <label className="field field--full">
              <span>Origin</span>
              <input
                type="text"
                value={tripForm.origin}
                onChange={(event) => setTripForm((current) => ({ ...current, origin: event.target.value }))}
                placeholder="Pettah, Colombo"
              />
            </label>

            <label className="field field--full">
              <span>Destination</span>
              <input
                type="text"
                value={tripForm.destination}
                onChange={(event) => setTripForm((current) => ({ ...current, destination: event.target.value }))}
                placeholder="Maharagama, Colombo"
              />
            </label>
          </div>

          <div className="button-row">
            <button className="button--primary" disabled={!isLoaded || isPlanningTrip} onClick={handleTripPlan} type="button">
              {isPlanningTrip ? 'Searching...' : 'Find bus routes'}
            </button>
          </div>

          <p className="inline-note inline-note--compact">
            Results depend on Google transit coverage for the selected area.
          </p>
          {tripPlannerError ? <p className="inline-note inline-note--error">{tripPlannerError}</p> : null}
        </section>

        {tripOptions.length ? (
          <section className="planner-routes">
            {tripOptions.map((tripOption, tripIndex) => (
              <button
                key={tripOption.id}
                className={tripIndex === selectedTripIndex ? 'planner-route-card planner-route-card--active' : 'planner-route-card'}
                onClick={() => selectTripOption(tripIndex)}
                type="button"
              >
                <strong>Option {tripIndex + 1}</strong>
                <span>
                  {tripOption.durationText || 'Duration unavailable'}
                  {tripOption.departureTime ? ` | Depart ${tripOption.departureTime}` : ''}
                </span>
                <span>{tripOption.busLines.length ? `Buses: ${tripOption.busLines.join(', ')}` : 'No bus line metadata'}</span>
              </button>
            ))}
          </section>
        ) : null}

        {selectedTrip ? (
          <section className="planner-steps">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Transit details</p>
                <h3>{selectedTrip.busLines.length ? selectedTrip.busLines.join(' -> ') : 'Trip steps'}</h3>
              </div>
            </div>

            {selectedTrip.steps.map((step) => (
              <article className={step.lineName ? 'planner-step planner-step--bus' : 'planner-step'} key={step.id}>
                <div className="bus-card__head">
                  <h3>{step.lineName || step.travelMode}</h3>
                  <span>{step.durationText || step.distanceText}</span>
                </div>
                <p>
                  {step.instructions || 'Route step'}
                  {step.headsign ? <><br />Headsign: {step.headsign}</> : null}
                  {step.departureStop ? <><br />From: {step.departureStop}</> : null}
                  {step.arrivalStop ? <><br />To: {step.arrivalStop}</> : null}
                  {step.stopCount ? <><br />Stops: {step.stopCount}</> : null}
                </p>
              </article>
            ))}
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

        <p className="section-label">Routes</p>

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

        <p className="section-label">Active buses</p>

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
