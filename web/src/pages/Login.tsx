import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Gamepad2, LogIn } from 'lucide-react';
import { Button, IconButton } from '../components/Button';
import { Input } from '../components/Form';
import { health } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/useAsync';
import type { Role } from '../lib/types';

/** Super Admin lands on the dashboard, a customer on their own home screen. */
export function homeFor(role: Role): string {
  return role === 'superadmin' ? '/dashboard' : '/beranda';
}

/** Only a same-origin path may be used as a post-login target. */
function safeFrom(state: unknown): string | null {
  const from = (state as { from?: string } | null)?.from;
  return from && from.startsWith('/') && !from.startsWith('//') ? from : null;
}

export function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    // Footer version is decoration — a failed fetch just hides it.
    health.get().then((h) => setVersion(h.version)).catch(() => setVersion(null));
  }, []);

  if (!loading && user) {
    const from = safeFrom(location.state);
    return <Navigate to={from ?? homeFor(user.role)} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Nama pengguna dan sandi wajib diisi.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const me = await login(username.trim(), password);
      navigate(safeFrom(location.state) ?? homeFor(me.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-bg px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-[var(--radius-lg)] bg-accent text-text-inverse">
          <Gamepad2 className="size-8" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-h1 font-bold tracking-heading text-text">PlayRent</h1>
          <p className="mt-1 text-body-sm text-text-secondary">Sistem rental PlayStation</p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-e2)]"
      >
        <h2 className="text-h3 font-semibold text-text">Masuk</h2>
        <p className="mt-1 text-body-sm text-text-secondary">Masuk dengan akun Anda.</p>
        <p className="mt-1 text-caption text-text-muted">* wajib diisi</p>

        <div className="mt-5 flex flex-col gap-4">
          <Input
            label="Nama pengguna"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            requiredMark
          />
          <Input
            label="Sandi"
            type={reveal ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            requiredMark
            suffix={
              <IconButton
                size="sm"
                icon={reveal ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                label={reveal ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                aria-pressed={reveal}
                onClick={() => setReveal((v) => !v)}
              />
            }
          />

          {error && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-body-sm text-danger-text">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={busy}
            loadingText="Masuk…"
            iconLeft={<LogIn className="size-5" aria-hidden="true" />}
          >
            Masuk
          </Button>
        </div>
      </form>

      <p className="text-body-sm text-text-secondary">
        Belum punya akun?{' '}
        <Link to="/daftar" className="text-accent-text underline-offset-2 hover:underline">
          Daftar
        </Link>
      </p>

      <p className="text-caption text-text-muted">{version ? `PlayRent v${version}` : ''}</p>
    </div>
  );
}
