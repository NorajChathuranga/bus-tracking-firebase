import { Suspense, lazy } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';

const PassengerPage = lazy(() => import('./pages/PassengerPage'));
const DriverPage = lazy(() => import('./pages/DriverPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

const navLinkClass = ({ isActive }) =>
  isActive ? 'topbar__link topbar__link--active' : 'topbar__link';

function IconMap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function IconSteering() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v8M2 12h8M12 22v-8M22 12h-8" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconBus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6v6M16 6v6M2 12h20M6 18h2M16 18h2" />
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </svg>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <div className="topbar__logo">
            <IconBus />
          </div>
          <div className="topbar__brand-text">
            <h1 className="topbar__title">BusTracker</h1>
            <p className="topbar__subtitle">Live transit tracking</p>
          </div>
        </div>

        <nav className="topbar__nav" aria-label="Primary navigation">
          <NavLink className={navLinkClass} to="/">
            <IconMap />
            Passenger
          </NavLink>
          <NavLink className={navLinkClass} to="/driver">
            <IconSteering />
            Driver
          </NavLink>
          <NavLink className={navLinkClass} to="/admin">
            <IconSettings />
            Admin
          </NavLink>
        </nav>
      </header>

      <main className="content-grid">
        <Suspense fallback={<div className="loading-fallback"><div className="spinner" />Loading...</div>}>
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
