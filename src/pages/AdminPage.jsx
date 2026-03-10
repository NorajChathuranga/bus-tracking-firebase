import { useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ref, update } from 'firebase/database';
import useLiveBuses from '../hooks/useLiveBuses';
import useTransitNetwork from '../hooks/useTransitNetwork';
import { auth, database, firestore, isFirebaseConfigured } from '../lib/firebase';

function createRouteDraft(route) {
  if (!route) {
    return {
      routeId: '',
      name: '',
      color: '#e4572e',
      centerLat: '6.9271',
      centerLng: '79.8612',
      buses: '',
      pathJson: '[]',
      stopsJson: '[]',
    };
  }

  return {
    routeId: route.id,
    name: route.name,
    color: route.color,
    centerLat: String(route.center?.[0] ?? ''),
    centerLng: String(route.center?.[1] ?? ''),
    buses: route.buses.join(', '),
    pathJson: JSON.stringify(route.path, null, 2),
    stopsJson: JSON.stringify(route.stops, null, 2),
  };
}

function parseJsonField(label, value) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

export default function AdminPage() {
  const { routes, source: routeSource } = useTransitNetwork();
  const { buses, isLoading: isBusLoading } = useLiveBuses();
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authForm, setAuthForm] = useState({ email: 'admin@example.com', password: 'admin123' });
  const [routeEditorId, setRouteEditorId] = useState('new');
  const [routeDraft, setRouteDraft] = useState(createRouteDraft());
  const [busDraft, setBusDraft] = useState({ busId: 'bus_138_03', routeId: '138', driverId: 'unassigned', status: 'active' });
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState('');
  const [isSavingRoute, setIsSavingRoute] = useState(false);
  const [isSavingBus, setIsSavingBus] = useState(false);

  const totalStops = useMemo(
    () => routes.reduce((count, route) => count + route.stops.length, 0),
    [routes],
  );

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
    if (routeEditorId === 'new') {
      return;
    }

    const selectedRoute = routes.find((route) => route.id === routeEditorId);

    if (selectedRoute) {
      setRouteDraft(createRouteDraft(selectedRoute));
    }
  }, [routeEditorId, routes]);

  async function handleAuth(mode) {
    setFeedback('');
    setFeedbackType('');

    try {
      if (mode === 'register') {
        await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        setFeedback('Admin account created.');
        setFeedbackType('success');
      } else {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
        setFeedback('Admin signed in.');
        setFeedbackType('success');
      }
    } catch (error) {
      setFeedback(error.message);
      setFeedbackType('error');
    }
  }

  async function handleRouteSave() {
    if (!firestore) {
      setFeedback('Firestore is not configured.');
      setFeedbackType('error');
      return;
    }

    if (!routeDraft.routeId.trim() || !routeDraft.name.trim()) {
      setFeedback('Route ID and route name are required.');
      setFeedbackType('error');
      return;
    }

    setIsSavingRoute(true);
    setFeedback('');
    setFeedbackType('');

    try {
      const path = parseJsonField('Path JSON', routeDraft.pathJson);
      const stops = parseJsonField('Stops JSON', routeDraft.stopsJson);

      await setDoc(doc(firestore, 'routes', routeDraft.routeId.trim()), {
        name: routeDraft.name.trim(),
        color: routeDraft.color.trim() || '#e4572e',
        center: [Number(routeDraft.centerLat), Number(routeDraft.centerLng)],
        buses: routeDraft.buses
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
        path,
        stops,
      });

      setRouteEditorId(routeDraft.routeId.trim());
      setFeedback(`Saved route ${routeDraft.routeId.trim()}.`);
      setFeedbackType('success');
    } catch (error) {
      setFeedback(error.message);
      setFeedbackType('error');
    } finally {
      setIsSavingRoute(false);
    }
  }

  async function handleBusSave() {
    if (!database) {
      setFeedback('Realtime Database is not configured.');
      setFeedbackType('error');
      return;
    }

    if (!busDraft.busId.trim() || !busDraft.routeId.trim()) {
      setFeedback('Bus ID and route ID are required.');
      setFeedbackType('error');
      return;
    }

    setIsSavingBus(true);
    setFeedback('');
    setFeedbackType('');

    try {
      await update(ref(database, `buses/${busDraft.busId.trim()}`), {
        routeId: busDraft.routeId.trim(),
        driverId: busDraft.driverId.trim() || 'unassigned',
        status: busDraft.status,
        lastSeenAt: Date.now(),
      });

      setFeedback(`Saved bus ${busDraft.busId.trim()}.`);
      setFeedbackType('success');
    } catch (error) {
      setFeedback(error.message);
      setFeedbackType('error');
    } finally {
      setIsSavingBus(false);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setFeedback('Signed out.');
    setFeedbackType('success');
  }

  return (
    <section className="panel-layout panel-layout--single">
      <article className="panel panel--driver">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Admin dashboard</p>
            <h2>Operations center</h2>
          </div>
          <div className="status-row">
            <span className="status-pill status-pill--live">{buses.length} live</span>
            <span className="status-pill status-pill--subtle">Source: {routeSource}</span>
          </div>
        </div>

        {!isFirebaseConfigured ? (
          <div className="empty-state">
            <h3>Firebase setup missing</h3>
            <p>Add your Firebase credentials before using the admin dashboard.</p>
          </div>
        ) : null}

        {isFirebaseConfigured && isAuthLoading ? (
          <div className="loading-fallback"><div className="spinner" />Checking admin session...</div>
        ) : null}

        {isFirebaseConfigured && !isAuthLoading && !user ? (
          <div className="driver-grid">
            <section className="card-stack">
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>

              <div className="button-row">
                <button className="button--primary" onClick={() => handleAuth('signin')} type="button">
                  Sign in
                </button>
                <button className="button button--secondary" onClick={() => handleAuth('register')} type="button">
                  Create account
                </button>
              </div>

              {feedback ? <p className={feedbackType === 'success' ? 'inline-note inline-note--success' : 'inline-note inline-note--error'}>{feedback}</p> : null}
            </section>

            <aside className="info-card">
              <p className="eyebrow">Important</p>
              <h3>Access control</h3>
              <p>
                Add role-based authorization rules in Firebase Security Rules before deploying to production.
              </p>
            </aside>
          </div>
        ) : null}

        {isFirebaseConfigured && user ? (
          <div className="admin-grid">
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

              <div className="stat-grid">
                <article className="stat-card">
                  <h3>{routes.length}</h3>
                  <p>Routes</p>
                </article>
                <article className="stat-card">
                  <h3>{totalStops}</h3>
                  <p>Total stops</p>
                </article>
                <article className="stat-card">
                  <h3>{buses.length}</h3>
                  <p>Live buses</p>
                </article>
              </div>

              <hr className="divider" />

              <section className="info-card">
                <div className="panel__header">
                  <div>
                    <p className="eyebrow">Route editor</p>
                    <h3>Manage route catalog</h3>
                  </div>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Load route</span>
                    <select
                      value={routeEditorId}
                      onChange={(event) => {
                        setRouteEditorId(event.target.value);
                        if (event.target.value === 'new') {
                          setRouteDraft(createRouteDraft());
                        }
                      }}
                    >
                      <option value="new">New route</option>
                      {routes.map((route) => (
                        <option key={route.id} value={route.id}>
                          {route.id} - {route.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Route ID</span>
                    <input
                      type="text"
                      value={routeDraft.routeId}
                      onChange={(event) => setRouteDraft((current) => ({ ...current, routeId: event.target.value }))}
                    />
                  </label>

                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={routeDraft.name}
                      onChange={(event) => setRouteDraft((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>

                  <label className="field">
                    <span>Color</span>
                    <input
                      type="text"
                      value={routeDraft.color}
                      onChange={(event) => setRouteDraft((current) => ({ ...current, color: event.target.value }))}
                    />
                  </label>

                  <label className="field">
                    <span>Center latitude</span>
                    <input
                      type="text"
                      value={routeDraft.centerLat}
                      onChange={(event) => setRouteDraft((current) => ({ ...current, centerLat: event.target.value }))}
                    />
                  </label>

                  <label className="field">
                    <span>Center longitude</span>
                    <input
                      type="text"
                      value={routeDraft.centerLng}
                      onChange={(event) => setRouteDraft((current) => ({ ...current, centerLng: event.target.value }))}
                    />
                  </label>

                  <label className="field field--full">
                    <span>Buses, comma separated</span>
                    <input
                      type="text"
                      value={routeDraft.buses}
                      onChange={(event) => setRouteDraft((current) => ({ ...current, buses: event.target.value }))}
                    />
                  </label>

                  <label className="field field--full">
                    <span>Path JSON</span>
                    <textarea
                      className="textarea"
                      rows="8"
                      value={routeDraft.pathJson}
                      onChange={(event) => setRouteDraft((current) => ({ ...current, pathJson: event.target.value }))}
                    />
                  </label>

                  <label className="field field--full">
                    <span>Stops JSON</span>
                    <textarea
                      className="textarea"
                      rows="10"
                      value={routeDraft.stopsJson}
                      onChange={(event) => setRouteDraft((current) => ({ ...current, stopsJson: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="button-row">
                  <button className="button--primary" disabled={isSavingRoute} onClick={handleRouteSave} type="button">
                    {isSavingRoute ? 'Saving...' : 'Save route'}
                  </button>
                </div>
              </section>

              <hr className="divider" />

              <section className="info-card">
                <div className="panel__header">
                  <div>
                    <p className="eyebrow">Bus registry</p>
                    <h3>Assign buses to routes</h3>
                  </div>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Bus ID</span>
                    <input
                      type="text"
                      value={busDraft.busId}
                      onChange={(event) => setBusDraft((current) => ({ ...current, busId: event.target.value }))}
                    />
                  </label>

                  <label className="field">
                    <span>Route</span>
                    <select
                      value={busDraft.routeId}
                      onChange={(event) => setBusDraft((current) => ({ ...current, routeId: event.target.value }))}
                    >
                      {routes.map((route) => (
                        <option key={route.id} value={route.id}>
                          {route.id} - {route.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Driver ID</span>
                    <input
                      type="text"
                      value={busDraft.driverId}
                      onChange={(event) => setBusDraft((current) => ({ ...current, driverId: event.target.value }))}
                    />
                  </label>

                  <label className="field">
                    <span>Status</span>
                    <select
                      value={busDraft.status}
                      onChange={(event) => setBusDraft((current) => ({ ...current, status: event.target.value }))}
                    >
                      <option value="active">active</option>
                      <option value="idle">idle</option>
                      <option value="disabled">disabled</option>
                    </select>
                  </label>
                </div>

                <div className="button-row">
                  <button className="button--primary" disabled={isSavingBus} onClick={handleBusSave} type="button">
                    {isSavingBus ? 'Saving...' : 'Save bus'}
                  </button>
                </div>
              </section>

              {feedback ? (
                <p className={feedbackType === 'success' ? 'inline-note inline-note--success' : 'inline-note inline-note--error'}>
                  {feedback}
                </p>
              ) : null}
            </section>

            <aside className="card-stack">
              <section className="info-card info-card--highlight">
                <h3>Live fleet monitor</h3>
                <p>
                  Active buses are pulled from the same realtime stream used by the passenger map.
                  {!isBusLoading ? '' : ' Loading current fleet state...'}
                </p>
              </section>

              <div className="bus-list">
                {buses.map((bus) => (
                  <article className="bus-card bus-card--fresh" key={bus.busId}>
                    <div className="bus-card__head">
                      <h3>{bus.busId}</h3>
                      <span>{bus.routeId}</span>
                    </div>
                    <p>
                      Driver: {bus.driverId}
                      <br />
                      Speed: {Math.round(bus.speed)} km/h
                      <br />
                      Source: {bus.source}
                    </p>
                  </article>
                ))}

                {!buses.length ? (
                  <div className="empty-state empty-state--compact">
                    <h3>No active buses</h3>
                    <p>Driver clients will appear here as soon as they start tracking.</p>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        ) : null}
      </article>
    </section>
  );
}