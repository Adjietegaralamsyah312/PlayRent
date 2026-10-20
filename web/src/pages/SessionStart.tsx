import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Play } from 'lucide-react';
import { PageHeader, PageSection, StickyActionBar } from '../components/AppShell';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConsoleCard } from '../components/ConsoleCard';
import { EmptyState, Skeleton } from '../components/Feedback';
import { Input, Textarea } from '../components/Form';
import { consoles, sessions, settings as settingsApi } from '../lib/api';
import { formatDurationShort, formatIDR } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings-context';
import { useToast } from '../lib/toast';
import { errorCode, errorMessage, useAsync } from '../lib/useAsync';
import type { ConsoleUnit, DurationPackage, Quote } from '../lib/types';

function toInt(v: string): number {
  const n = Number(v.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Local datetime string for `<input type="datetime-local">`. */
function localNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SessionStart() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { success, error: toastError } = useToast();

  const units = useAsync(() => consoles.list({ status: 'available' }), []);
  const packages = useAsync(() => settingsApi.packages(), []);

  // `/unit` and `/booking` deep-link straight into a preselected console.
  const [consoleId, setConsoleId] = useState<string | null>(params.get('consoleId'));
  const [customerName, setCustomerName] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [customMinutes, setCustomMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [startedAt, setStartedAt] = useState(localNow());
  const [quote, setQuote] = useState<Quote | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const minDuration = settings?.rules.minDurationMinutes ?? 30;
  const effectiveMinutes = customMinutes ? toInt(customMinutes) : minutes;
  const selected = units.data?.items.find((u) => u.id === consoleId) ?? null;

  // Price preview always comes from the server — the client never computes money.
  useEffect(() => {
    if (!consoleId || effectiveMinutes < 1) { setQuote(null); return; }
    let alive = true;
    sessions.quote({ consoleId, durationMinutes: effectiveMinutes })
      .then((q) => { if (alive) setQuote(q); })
      .catch(() => { if (alive) setQuote(null); });
    return () => { alive = false; };
  }, [consoleId, effectiveMinutes]);

  const activePackages: DurationPackage[] = (packages.data?.items ?? []).filter(
    (p) => p.isActive && (!p.consoleType || !selected || p.consoleType === selected.consoleType),
  );

  const durationInvalid = effectiveMinutes < minDuration;

  async function handleSubmit() {
    if (!consoleId) { setFormError('Pilih konsol terlebih dahulu.'); return; }
    if (customerName.trim().length < 2) { setFormError('Nama pelanggan wajib diisi.'); return; }
    if (durationInvalid) { setFormError(`Durasi minimal ${minDuration} menit.`); return; }
    setBusy(true);
    setFormError(null);
    try {
      const { session } = await sessions.create({
        consoleId,
        customerName: customerName.trim(),
        customerContact: customerContact.trim() || undefined,
        durationMinutes: effectiveMinutes,
        notes: notes.trim() || undefined,
        startedAt: user?.role === 'superadmin' ? new Date(startedAt).toISOString() : undefined,
      });
      success(`Sesi ${session.consoleCode ?? ''} dimulai.`.trim());
      navigate(`/sesi/${session.id}`, { replace: true });
    } catch (e) {
      if (errorCode(e) === 'UNIT_OCCUPIED') {
        toastError('Konsol baru saja dipakai sesi lain.');
        void units.reload();
      } else {
        setFormError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  const submitButton = (
    <Button
      size="lg"
      fullWidth
      className="lg:w-auto"
      loading={busy}
      loadingText="Memulai…"
      iconLeft={<Play className="size-5" aria-hidden="true" />}
      disabled={!consoleId || durationInvalid}
      onClick={handleSubmit}
    >
      Mulai sesi · {formatIDR(quote?.total ?? 0)}
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Mulai sesi"
        subtitle="Pilih konsol, isi data pelanggan, lalu tentukan durasi."
        breadcrumb={[{ label: 'Sesi', href: '/sesi' }, { label: 'Mulai sesi' }]}
        backTo="/sesi"
      />

      <PageSection
        title="Pilih konsol"
        description={units.data ? `${units.data.items.length} konsol tersedia` : undefined}
      >
        {units.loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} variant="card" />)}
          </div>
        ) : units.error ? (
          <EmptyState variant="error" title="Gagal memuat konsol" description={units.error} primaryAction={<Button onClick={() => void units.reload()}>Coba lagi</Button>} />
        ) : units.data && units.data.items.length === 0 ? (
          <EmptyState
            title="Tidak ada konsol tersedia"
            description="Semua konsol sedang dipakai, dipesan, atau dalam perawatan."
            primaryAction={<Button variant="secondary" onClick={() => navigate('/unit')}>Lihat semua konsol</Button>}
          />
        ) : (
          <>
            <p className="mb-2 text-caption text-text-muted">Ketuk kode unit untuk memilih konsol.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {units.data?.items.map((u: ConsoleUnit) => (
                <ConsoleCard
                  key={u.id}
                  console={u}
                  variant="compact"
                  selected={consoleId === u.id}
                  onOpenDetail={(id) => setConsoleId(id)}
                />
              ))}
            </div>
          </>
        )}
      </PageSection>

      <PageSection title="Data pelanggan">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nama pelanggan"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              maxLength={80}
              requiredMark
            />
            <Input
              label="Kontak (opsional)"
              value={customerContact}
              onChange={(e) => setCustomerContact(e.target.value)}
              inputMode="tel"
              maxLength={30}
            />
          </div>
        </Card>
      </PageSection>

      <PageSection title="Durasi">
        <Card>
          {activePackages.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {activePackages.map((p) => (
                <Button
                  key={p.id}
                  variant={!customMinutes && minutes === p.durationMinutes ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={!customMinutes && minutes === p.durationMinutes}
                  onClick={() => { setMinutes(p.durationMinutes); setCustomMinutes(''); }}
                >
                  {p.name} · {formatDurationShort(p.durationMinutes)} · {formatIDR(p.price)}
                </Button>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Durasi (menit)"
              inputMode="numeric"
              value={customMinutes || String(minutes)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d]/g, '');
                setCustomMinutes(raw);
                if (raw) setMinutes(toInt(raw));
              }}
              helpText={`Minimal ${minDuration} menit.`}
              error={durationInvalid ? `Minimal ${minDuration} menit.` : undefined}
              requiredMark
            />
            {user?.role === 'superadmin' && (
              <Input
                label="Mulai pada (admin)"
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                helpText="Biarkan apa adanya untuk mulai sekarang."
              />
            )}
          </div>
          <div className="mt-4">
            <Textarea
              label="Catatan (opsional)"
              rows={2}
              maxLength={200}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </Card>
      </PageSection>

      <PageSection title="Ringkasan">
        <Card>
          <dl className="flex flex-col gap-2 text-body-sm">
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">Konsol</dt>
              <dd className="text-text">{selected ? `${selected.code} · ${selected.consoleType} ${selected.roomType}` : '—'}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">Tarif per jam</dt>
              <dd className="tnum text-text">{formatIDR(quote?.hourlyRate ?? selected?.hourlyRate ?? 0)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">Durasi</dt>
              <dd className="text-text">{formatDurationShort(effectiveMinutes)}</dd>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-body">
              <dt className="font-medium text-text">Total</dt>
              <dd className="tnum font-bold text-accent-text">{formatIDR(quote?.total ?? 0)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-caption text-text-muted">
            Perkiraan. Total akhir dihitung saat sesi ditutup, termasuk kelebihan waktu.
          </p>
          {formError && <p role="alert" className="mt-3 text-body-sm text-danger">{formError}</p>}
        </Card>
      </PageSection>

      <div className="h-[4.5rem] lg:hidden" aria-hidden="true" />
      <StickyActionBar>{submitButton}</StickyActionBar>
    </div>
  );
}
