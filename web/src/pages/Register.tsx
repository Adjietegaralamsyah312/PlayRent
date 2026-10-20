import { useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CircleCheck, Gamepad2, UserPlus } from 'lucide-react';
import { Button } from '../components/Button';
import { Spinner } from '../components/Feedback';
import { Input } from '../components/Form';
import { auth } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/useAsync';
import { homeFor } from './Login';

// The server owns the rule set (server/src/routes/auth.js). These are the
// same constraints, mirrored so the customer is told before the round-trip.
const USERNAME_RE = /^[a-z0-9._]{3,32}$/;
const MIN_PASSWORD = 8;

interface Draft {
  username: string;
  fullName: string;
  phone: string;
  password: string;
  confirm: string;
}

const EMPTY: Draft = { username: '', fullName: '', phone: '', password: '', confirm: '' };

type FieldErrors = Partial<Record<keyof Draft, string>>;

function validate(d: Draft): FieldErrors {
  const errors: FieldErrors = {};
  const username = d.username.trim();
  if (!username) errors.username = 'Nama pengguna wajib diisi.';
  else if (!USERNAME_RE.test(username)) {
    errors.username = 'Hanya huruf kecil, angka, titik, dan garis bawah. Minimal 3 karakter.';
  }
  if (d.fullName.trim().length < 2) errors.fullName = 'Nama lengkap minimal 2 karakter.';
  if (d.password.length < MIN_PASSWORD) errors.password = `Kata sandi minimal ${MIN_PASSWORD} karakter.`;
  if (d.confirm.length === 0) errors.confirm = 'Ulangi kata sandi.';
  else if (d.confirm !== d.password) errors.confirm = 'Konfirmasi kata sandi tidak sama.';
  return errors;
}

/**
 * Public self-registration. The account is always a customer account — the
 * request body carries no `role` and the server decides the role itself.
 */
export function Register() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Focus follows the first invalid field (DS-010 m4).
  const usernameRef = useRef<HTMLInputElement>(null);
  const fullNameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const fieldRefs: Record<string, RefObject<HTMLInputElement | null>> = {
    username: usernameRef, fullName: fullNameRef, password: passwordRef, confirm: confirmRef,
  };

  // The session check runs first — do not flash the form to a signed-in user.
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Spinner />
      </div>
    );
  }

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  function set<K extends keyof Draft>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate(draft);
    setErrors(found);
    const firstInvalid = (['username', 'fullName', 'password', 'confirm'] as const).find((k) => found[k]);
    if (firstInvalid) {
      fieldRefs[firstInvalid]?.current?.focus();
      return;
    }

    setBusy(true);
    setServerError(null);
    try {
      // No `role` in the body: the server assigns it and would 400 a body
      // that tries to choose one.
      await auth.register({
        username: draft.username.trim(),
        fullName: draft.fullName.trim(),
        phone: draft.phone.trim() || undefined,
        password: draft.password,
      });
      setDone(true);
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-bg px-4 py-10">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-[var(--radius-lg)] bg-success-soft text-success">
            <CircleCheck className="size-8" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-h1 font-bold tracking-heading text-text">Akun berhasil dibuat</h1>
            <p className="mt-1 text-body-sm text-text-secondary">
              Akun Anda sudah aktif. Silakan masuk untuk membuat booking rental.
            </p>
          </div>
        </div>
        <Button size="lg" fullWidth onClick={() => navigate('/masuk')}>
          Masuk sekarang
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-bg px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-[var(--radius-lg)] bg-accent text-text-inverse">
          <Gamepad2 className="size-8" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-h1 font-bold tracking-heading text-text">Daftar PlayRent</h1>
          <p className="mt-1 text-body-sm text-text-secondary">Buat akun pelanggan untuk menyewa konsol.</p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-e2)]"
      >
        <h2 className="text-h3 font-semibold text-text">Akun baru</h2>
        <p className="mt-1 text-body-sm text-text-secondary">Data ini dipakai saat Anda memesan unit.</p>
        <p className="mt-1 text-caption text-text-muted">* wajib diisi</p>

        <div className="mt-5 flex flex-col gap-4">
          <Input
            label="Nama pengguna"
            ref={usernameRef}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={draft.username}
            onChange={(e) => set('username', e.target.value.toLowerCase().replace(/\s/g, ''))}
            helpText="Huruf kecil, angka, titik, dan garis bawah. Minimal 3 karakter."
            error={errors.username}
            requiredMark
          />
          <Input
            label="Nama lengkap"
            ref={fullNameRef}
            autoComplete="name"
            value={draft.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            maxLength={80}
            error={errors.fullName}
            requiredMark
          />
          <Input
            label="Nomor HP"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={draft.phone}
            onChange={(e) => set('phone', e.target.value)}
            maxLength={40}
            helpText="Opsional. Dipakai untuk menghubungi Anda."
          />
          <Input
            label="Kata sandi"
            ref={passwordRef}
            type="password"
            autoComplete="new-password"
            value={draft.password}
            onChange={(e) => set('password', e.target.value)}
            helpText={`Minimal ${MIN_PASSWORD} karakter.`}
            error={errors.password}
            requiredMark
          />
          <Input
            label="Ulangi kata sandi"
            ref={confirmRef}
            type="password"
            autoComplete="new-password"
            value={draft.confirm}
            onChange={(e) => set('confirm', e.target.value)}
            error={errors.confirm}
            requiredMark
          />

          {serverError && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-body-sm text-danger-text">
              {serverError}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={busy}
            loadingText="Mendaftarkan…"
            iconLeft={<UserPlus className="size-5" aria-hidden="true" />}
          >
            Daftar
          </Button>
        </div>
      </form>

      <p className="text-body-sm text-text-secondary">
        Sudah punya akun?{' '}
        <Link to="/masuk" className="text-accent-text underline-offset-2 hover:underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
