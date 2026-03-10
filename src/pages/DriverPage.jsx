import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { ref, set, update } from 'firebase/database';
import useTransitNetwork from '../hooks/useTransitNetwork';
import { auth, database, isFirebaseConfigured } from '../lib/firebase';

const initialForm = {
  email: 'driver@example.com',
  password: 'driver123',
  busId: 'bus_138_01',
  routeId: '138',
  crowdLevel: 'low',
};

function buildPayload({ busId, routeId, driverId, lat, lng, speed, source, crowdLevel, heading = 0 }) {
  return {
    busId,
    routeId,
    driverId,
    lat,
    lng,
    speed,
    source,
    crowdLevel,
    status: 'active',
    heading,
    timestamp: Date.now(),
  };
}

export default function DriverPage() {
  const { routes, source: routeSource } = useTransitNetwork();
  const [formState, setFormState] = useState(initialForm);
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [mode, setMode] = useState('demo');
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState('');
  const [lastPayload, setLastPayload] = useState(null);

  const intervalRef = useRef(null);
  const demoIndexRef = useRef(0);
  const stopTrackingRef = useRef(null);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === formState.routeId) ?? routes[0] ?? null,
    [formState.routeId, routes],
  );
  const availableBuses = selectedRoute?.buses ?? [];

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setIsAuthLoading(false);
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      if (stopTrackingRef.current) {
        stopTrackingRef.current().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedRoute || isTracking) {
      return;
    }

    setFormState((current) => {
      const nextBusId = availableBuses[0] ?? current.busId;

      if (current.routeId === selectedRoute.id && current.busId === nextBusId) {
        return current;
      }

      return {
        ...current,
        routeId: selectedRoute.id,
        busId: nextBusId,
      };
    });
  }, [availableBuses, isTracking, selectedRoute]);

  function setField(fieldName, value) {
    setFormState((current) => ({
      ...current,
      [fieldName]: value,
    }));
  }

  async function persistLocation(payload) {
    if (!database) {
      throw new Error('Realtime Database is not configured.');
    }

    await Promise.all([
      set(ref(database, `live_locations/${payload.busId}`), payload),
      update(ref(database, `buses/${payload.busId}`), {
        routeId: payload.routeId,
        driverId: payload.driverId,
        status: 'active',
        crowdLevel: payload.crowdLevel,
        lastSeenAt: payload.timestamp,
      }),
    ]);

    setLastPayload(payload);
    setFeedback(`Published ${payload.busId} at ${new Date(payload.timestamp).toLocaleTimeString()}.`);
    setFeedbackType('success');
  }

  async function publishDeviceLocation() {
    if (!navigator.geolocation) {
      throw new Error('Browser geolocation is not available on this device. Use demo mode instead.');
    }

    const coordinates = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    });

    const payload = buildPayload({
      busId: formState.busId.trim(),
      routeId: formState.routeId.trim(),
      driverId: user?.uid ?? 'unknown-driver',
      lat: coordinates.coords.latitude,
      lng: coordinates.coords.longitude,
      speed: Math.max(0, (coordinates.coords.speed ?? 0) * 3.6),
      heading: coordinates.coords.heading ?? 0,
      source: 'device',
      crowdLevel: formState.crowdLevel,
    });

    await persistLocation(payload);
  }

  async function publishDemoLocation() {
    const routePath = selectedRoute?.path?.length ? selectedRoute.path : [[6.9271, 79.8612]];
    const point = routePath[demoIndexRef.current % routePath.length];

    demoIndexRef.current += 1;

    const payload = buildPayload({
      busId: formState.busId.trim(),
      routeId: formState.routeId.trim(),
      driverId: user?.uid ?? 'demo-driver',
      lat: point[0],
      lng: point[1],
      speed: 28,
      source: 'demo',
      crowdLevel: formState.crowdLevel,
    });

    await persistLocation(payload);
  }

  async function startTracking() {
    if (!formState.busId.trim() || !formState.routeId.trim()) {
      setFeedback('Bus ID and route ID are required before tracking starts.');
      setFeedbackType('error');
      return;
    }

    try {
      if (mode === 'device') {
        await publishDeviceLocation();
        intervalRef.current = window.setInterval(() => {
          publishDeviceLocation().catch((error) => {
            setFeedback(error.message);
            setFeedbackType('error');
            stopTracking().catch(() => {});
          });
        }, 5000);
      } else {
        await publishDemoLocation();
        intervalRef.current = window.setInterval(() => {
          publishDemoLocation().catch((error) => {
            setFeedback(error.message);
            setFeedbackType('error');
            stopTracking().catch(() => {});
          });
        }, 5000);
      }

      setIsTracking(true);
      setFeedback('Tracking is live. Passenger clients will receive updates immediately.');
      setFeedbackType('success');
    } catch (error) {
      setFeedback(error.message);
      setFeedbackType('error');
      await stopTracking().catch(() => {});
    }
  }

  async function stopTracking() {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (database && formState.busId.trim()) {
      await update(ref(database, `buses/${formState.busId.trim()}`), {
        status: 'idle',
        crowdLevel: formState.crowdLevel,
        lastSeenAt: Date.now(),
      }).catch(() => {});
    }

    setIsTracking(false);
    demoIndexRef.current = 0;
  }

  stopTrackingRef.current = stopTracking;

  async function handleLogin(modeName) {
    setIsSubmitting(true);
    setFeedback('');
    setFeedbackType('');

    try {
      if (modeName === 'register') {
        await createUserWithEmailAndPassword(auth, formState.email, formState.password);
        setFeedback('Driver account created. You can start tracking now.');
        setFeedbackType('success');
      } else {
        await signInWithEmailAndPassword(auth, formState.email, formState.password);
        setFeedback('Driver signed in.');
        setFeedbackType('success');
      }
    } catch (error) {
      setFeedback(error.message);
      setFeedbackType('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    await stopTracking().catch(() => {});
    await signOut(auth);
    setFeedback('Signed out.');
    setFeedbackType('success');
  }

  return (
    <section className="panel-layout panel-layout--single">
      <article className="panel panel--driver">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Driver console</p>
            <h2>GPS tracking</h2>
          </div>
          <div className="status-row">
            {isTracking
              ? <span className="tracking-badge tracking-badge--active">Broadcasting</span>
              : <span className="tracking-badge tracking-badge--idle">Idle</span>
            }
            <span className="status-pill status-pill--subtle">5s interval</span>
          </div>
        </div>

        {!isFirebaseConfigured ? (
          <div className="empty-state">
            <h3>Firebase setup missing</h3>
            <p>
              Add your Firebase credentials to .env, enable Email/Password authentication, and create a
              Realtime Database.
            </p>
          </div>
        ) : null}

        {isFirebaseConfigured && isAuthLoading ? (
          <div className="loading-fallback"><div className="spinner" />Checking driver session...</div>
        ) : null}

        {isFirebaseConfigured && !isAuthLoading && !user ? (
          <div className="driver-grid">
            <section className="card-stack">
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={formState.email}
                  onChange={(event) => setField('email', event.target.value)}
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={formState.password}
                  onChange={(event) => setField('password', event.target.value)}
                />
              </label>

              <div className="button-row">
                <button className="button--primary" disabled={isSubmitting} onClick={() => handleLogin('signin')} type="button">
                  Sign in
                </button>
                <button
                  className="button button--secondary"
                  disabled={isSubmitting}
                  onClick={() => handleLogin('register')}
                  type="button"
                >
                  Create driver account
                </button>
              </div>
            </section>

            <aside className="info-card">
              <p className="eyebrow">Quick start</p>
              <h3>Browser-based console</h3>
              <p>
                Use this console to simulate or broadcast live GPS. Validate the Firebase
                pipeline before building a native driver app.
              </p>
            </aside>
          </div>
        ) : null}

        {isFirebaseConfigured && user ? (
          <div className="driver-grid">
            <section className="card-stack">
              <div className="identity-row">
                <div>
                  <p className="eyebrow">Signed in</p>
                  <h3>{user.email}</h3>
                </div>
                <button className="button button--secondary" onClick={handleLogout} type="button">
                  Sign out
                </button>
              </div>

              <label className="field">
                <span>Route</span>
                <select
                  value={formState.routeId}
                  onChange={(event) => {
                    const nextRoute = routes.find((route) => route.id === event.target.value);
                    demoIndexRef.current = 0;
                    setFormState((current) => ({
                      ...current,
                      routeId: event.target.value,
                      busId: nextRoute?.buses?.[0] ?? current.busId,
                    }));
                  }}
                >
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.id} - {route.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Bus ID</span>
                <select value={formState.busId} onChange={(event) => setField('busId', event.target.value)}>
                  {availableBuses.map((busId) => (
                    <option key={busId} value={busId}>
                      {busId}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Crowd level</span>
                <select value={formState.crowdLevel} onChange={(event) => setField('crowdLevel', event.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="full">Full</option>
                </select>
              </label>

              <div className="segmented-control" role="radiogroup" aria-label="Tracking source">
                <button
                  className={mode === 'demo' ? 'segment segment--active' : 'segment'}
                  onClick={() => setMode('demo')}
                  type="button"
                >
                  Demo route
                </button>
                <button
                  className={mode === 'device' ? 'segment segment--active' : 'segment'}
                  onClick={() => setMode('device')}
                  type="button"
                >
                  Device GPS
                </button>
              </div>

              <div className="button-row">
                <button className="button--primary" disabled={isTracking} onClick={startTracking} type="button">
                  Start tracking
                </button>
                <button
                  className="button button--secondary"
                  disabled={!isTracking}
                  onClick={() => stopTracking().catch(() => {})}
                  type="button"
                >
                  Stop
                </button>
              </div>

              {feedback ? (
                <p className={feedbackType === 'error' ? 'inline-note inline-note--error' : 'inline-note inline-note--success'}>
                  {feedback}
                </p>
              ) : null}
            </section>

            <aside className="info-card info-card--highlight">
              <h3>{selectedRoute ? `Route ${selectedRoute.id}` : 'Latest payload'}</h3>
              {selectedRoute ? (
                <p>
                  {selectedRoute.name}
                  <br />
                  Stops: {selectedRoute.stops.length}
                  <br />
                  Fleet size: {selectedRoute.buses.length}
                  <br />
                  Crowd: {formState.crowdLevel}
                </p>
              ) : null}
              {lastPayload ? (
                <pre>{JSON.stringify(lastPayload, null, 2)}</pre>
              ) : (
                <p>Your last live location update will appear here.</p>
              )}
            </aside>
          </div>
        ) : null}
      </article>
    </section>
  );
}
