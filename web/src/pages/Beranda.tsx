import { useNavigate } from 'react-router-dom';
import { CalendarClock, CalendarPlus, ChevronRight, Gamepad2, MapPin, Timer } from 'lucide-react';
import { PageHeader, PageSection } from '../components/AppShell';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/Badge';
import { EmptyState, Skeleton } from '../components/Feedback';
import { bookings, consoles, settings } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDurationShort, formatIDR, formatJakarta, greeting, toJakartaDateTimeStr } from '../lib/format';
import { EFFECTIVE_BOOKING_STATUS, effectiveBookingStatus } from '../lib/status';
import { useAsync } from '../lib/useAsync';
import type { Booking } from '../lib/types';

/** A booking the customer still has to show up for. */
const UPCOMING: Booking['status'][] = ['pending', 'confirmed'];

export function Beranda() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const list = useAsync(() => bookings.list(), []);
  const units = useAsync(() => consoles.listPublic(), []);
  const cfg = useAsync(() => settings.getPublic(), []);

  const now = toJakartaDateTimeStr();
  const codeOf = (consoleId: number) => units.data?.items.find((u) => u.id === consoleId)?.code ?? '—';

  // The next slot: still open, not expired, and its start time is still ahead
  // of us — a booking whose hour has passed today is not "berikutnya" (DS-010 M1).
  const next = (list.data?.items ?? [])
    .filter((b) => UPCOMING.includes(b.status)
      && effectiveBookingStatus(b) !== 'expired'
      && `${b.bookingDate} ${b.startTime}` >= now)
    .sort((a, b) => `${a.bookingDate} ${a.startTime}`.localeCompare(`${b.bookingDate} ${b.startTime}`))[0];

  const firstName = (user?.fullName ?? '').split(' ')[0] || user?.fullName || '';
  const rules = cfg.data?.rules;
  const business = cfg.data?.business;

  if (list.loading || cfg.loading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton variant="text" className="h-8 w-2/3" />
        <Skeleton variant="card" />
        <Skeleton variant="block" />
      </div>
    );
  }

  if (list.error || units.error || cfg.error) {
    return (
      <EmptyState
        variant="error"
        headingLevel={1}
        title="Gagal memuat beranda"
        description={list.error ?? units.error ?? cfg.error ?? 'Data tidak dapat dimuat.'}
        primaryAction={<Button onClick={() => { void list.reload(); void units.reload(); void cfg.reload(); }}>Coba lagi</Button>}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        subtitle="Kelola booking rental Anda di sini."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="lg" onClick={() => navigate('/booking-saya')}>
              Lihat booking saya
            </Button>
            <Button size="lg" iconLeft={<CalendarPlus className="size-5" aria-hidden="true" />} onClick={() => navigate('/booking-saya?buat=1')}>
              Buat booking
            </Button>
          </div>
        }
      />

      <PageSection title="Booking berikutnya" description="Slot yang masih menunggu Anda.">
        {next ? (
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-h3 font-semibold text-text">
                    {formatJakarta(`${next.bookingDate}T00:00:00+07:00`, 'date')} · {next.startTime}
                  </p>
                  <StatusBadge value={effectiveBookingStatus(next)} map={EFFECTIVE_BOOKING_STATUS} />
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <Gamepad2 className="size-4 text-text-muted" aria-hidden="true" />
                    Unit {codeOf(next.consoleId)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Timer className="size-4 text-text-muted" aria-hidden="true" />
                    {formatDurationShort(next.durationMinutes)}
                  </span>
                </p>
              </div>
              <Button variant="secondary" iconRight={<ChevronRight className="size-4" aria-hidden="true" />} onClick={() => navigate('/booking-saya')}>
                Detail booking
              </Button>
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={<CalendarClock className="size-8" aria-hidden="true" />}
              title="Belum ada booking"
              description="Pesan unit Anda sekarang dan Admin akan mengonfirmasi."
              primaryAction={<Button size="lg" onClick={() => navigate('/booking-saya?buat=1')}>Buat booking</Button>}
            />
          </Card>
        )}
      </PageSection>

      <PageSection title="Tarif rental" description={business?.name}>
        <Card>
          <dl className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-body-sm text-text-secondary">Tarif dasar (mulai dari)</dt>
              <dd className="text-h3 font-bold tnum text-text">{formatIDR(rules?.defaultHourlyRate)}<span className="text-body-sm font-normal text-text-muted">/jam</span></dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-body-sm text-text-secondary">Durasi minimal</dt>
              <dd className="text-body-sm tnum text-text">{rules?.minDurationMinutes ?? '—'} menit</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-body-sm text-text-secondary">Pembulatan durasi</dt>
              <dd className="text-body-sm tnum text-text">{rules?.roundingMinutes ?? '—'} menit</dd>
            </div>
            {business?.address && (
              <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
                <dt className="flex items-center gap-1.5 text-body-sm text-text-secondary">
                  <MapPin className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
                  Alamat
                </dt>
                <dd className="max-w-[60%] text-right text-body-sm text-text">{business.address}</dd>
              </div>
            )}
          </dl>
        </Card>
      </PageSection>
    </div>
  );
}
