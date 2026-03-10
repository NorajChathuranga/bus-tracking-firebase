import { Suspense, lazy } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';

const PassengerPage = lazy(() => import('./pages/PassengerPage'));
const DriverPage = lazy(() => import('./pages/DriverPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

const navLinkClass = ({ isActive }) =>
  isActive ? 'topbar__link topbar__link--active' : 'topbar__link';

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Bus Tracking System</p>
          <h1>Live tracking, route network, and admin operations</h1>
          <p className="subtitle">
            Drivers publish bus locations, passengers track routes live, and admins manage the operating network.
          </p>
        </div>

        <nav className="topbar__nav" aria-label="Primary navigation">
          <NavLink className={navLinkClass} to="/">
            Passenger map
          </NavLink>
          <NavLink className={navLinkClass} to="/driver">
            Driver console
          </NavLink>
          <NavLink className={navLinkClass} to="/admin">
            Admin dashboard
          </NavLink>
        </nav>
      </header>

      <main className="content-grid">
        <Suspense fallback={<p className="inline-note">Loading page...</p>}>
          <Routes>
            <Route path="/" element={<PassengerPage />} />
            <Route path="/driver" element={<DriverPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
