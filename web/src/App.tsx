import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/Feedback';
import { EmptyState } from './components/Feedback';
import { Button } from './components/Button';
import { AuthProvider, hasRole, useAuth } from './lib/auth';
import { SettingsProvider } from './lib/settings-context';
import { ToastProvider } from './lib/toast';
import { Akun } from './pages/Akun';
import { Beranda } from './pages/Beranda';
import { BookingNew } from './pages/BookingNew';
import { BookingSaya } from './pages/BookingSaya';
import { Bookings } from './pages/Bookings';
import { Dashboard } from './pages/Dashboard';
import { Games } from './pages/Games';
import { InfoRental } from './pages/InfoRental';
import { Login, homeFor } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { Receipt } from './pages/Receipt';
import { Register } from './pages/Register';
import { Reports } from './pages/Reports';
import { SessionBoard } from './pages/Sessions';
import { SessionDetail } from './pages/SessionDetail';
import { SessionStart } from './pages/SessionStart';
import { Settings } from './pages/Settings';
import { TransactionDetail } from './pages/TransactionDetail';
import { Transactions } from './pages/Transactions';
import { Units } from './pages/Units';
import { Users } from './pages/Users';

/** Authenticated shell: gates on the session, then mounts the chrome the pages expect. */
function Shell() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Spinner />
      </div>
    );
  }

  if (!user) return <Navigate to="/masuk" replace state={{ from: location.pathname + location.search }} />;

  return (
    <SettingsProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </SettingsProvider>
  );
}

function IndexRedirect() {
  const { user } = useAuth();
  return <Navigate to={homeFor(user!.role)} replace />;
}

/**
 * Operator area. The redirect stays here so no screen has to re-check the
 * role. The real enforcement is server-side (BE-004) — this only keeps a
 * customer out of the operator screens.
 */
function SuperAdminOnly() {
  const { user } = useAuth();
  if (hasRole(user, ['superadmin'])) return <Outlet />;
  return (
    <EmptyState
      variant="no-permission"
      headingLevel={1}
      title="Akses terbatas"
      description="Halaman ini hanya untuk Super Admin."
      primaryAction={<Button onClick={() => window.history.back()}>Kembali</Button>}
    />
  );
}

/** Customer area — the renter screens. */
function UserOnly() {
  const { user } = useAuth();
  if (hasRole(user, ['user'])) return <Outlet />;
  return (
    <EmptyState
      variant="no-permission"
      headingLevel={1}
      title="Akses terbatas"
      description="Halaman ini hanya untuk pelanggan."
      primaryAction={<Button onClick={() => window.history.back()}>Kembali</Button>}
    />
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/masuk" element={<Login />} />
            <Route path="/daftar" element={<Register />} />

            <Route element={<Shell />}>
              <Route path="/" element={<IndexRedirect />} />

              <Route element={<SuperAdminOnly />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/sesi" element={<SessionBoard />} />
                <Route path="/sesi/baru" element={<SessionStart />} />
                <Route path="/sesi/:id" element={<SessionDetail />} />
                <Route path="/unit" element={<Units />} />
                <Route path="/booking" element={<Bookings />} />
                <Route path="/booking/baru" element={<BookingNew />} />
                <Route path="/transaksi" element={<Transactions />} />
                <Route path="/transaksi/:id" element={<TransactionDetail />} />
                <Route path="/transaksi/:id/struk" element={<Receipt />} />
                <Route path="/games" element={<Games />} />
                <Route path="/laporan" element={<Reports />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/users" element={<Users />} />
              </Route>

              <Route element={<UserOnly />}>
                <Route path="/beranda" element={<Beranda />} />
                <Route path="/booking-saya" element={<BookingSaya />} />
                <Route path="/info-rental" element={<InfoRental />} />
                <Route path="/akun" element={<Akun />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
