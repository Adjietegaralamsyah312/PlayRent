import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';import { AlertTriangle, CalendarPlus, CalendarX, ChevronLeft, ChevronRight, CircleCheck, Gamepad2, LogIn, Pencil, X } from 'lucide-react';
import { PageHeader, PageSection } from '../components/AppShell';
import { IconButton } from '../components/Button';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { BookingTimeline } from '../components/BookingTimeline';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { EmptyState } from '../components/Feedback';
import { Input, Textarea } from '../components/Form';
import { ConfirmDialog, Modal } from '../components/Modal';
import { StatusBadge } from '../components/Badge';
import { Tabs } from '../components/Tabs';
import { bookings, consoles } from '../lib/api';
import { formatDurationShort, formatIDR, formatJakarta, shiftDate, toJakartaDateStr } from '../lib/format';
import { EFFECTIVE_BOOKING_STATUS, effectiveBookingStatus } from '../lib/status';
import { useAuth } from '../lib/auth';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useToast } from '../lib/toast';
import { errorCode, errorMessage, useAsync } from '../lib/useAsync';
import type { Booking } from '../lib/types';

const TABS = [
  { value: 'all', label: 'Semua' },
  { value: 'pending', label: 'Menunggu' },
  { value: 'confirmed', label: 'Dikonfirmasi' },
  { value: 'checked_in', label: 'Check-in' },
  { value: 'expired', label: 'Kedaluwarsa' },
  { value: 'cancelled', label: 'Dibatalkan' },
];

interface Draft {
  id: string;
  customerName: string;
  customerContact: string;
  startTime: string;
  durationMinutes: string;
  discount: string;
  notes: string;
}

const today = () => toJakartaDateStr();

const VIEW_KEY = 'playrent.booking.view';
type BookingView = 'jadwal' | 'daftar';

function initialView(): BookingView {
  const saved = localStorage.getItem(VIEW_KEY);
  if (saved === 'jadwal' || saved === 'daftar') return saved;
  return window.matchMedia('(min-width: 768px)').matches ? 'jadwal' : 'daftar';
}

export function Bookings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const isAdmin = user?.role === 'superadmin';
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [view, setView] = useState<BookingView>(initialView);

  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? today();
  const [tab, setTab] = useState('all');

  const list = useAsync(() => bookings.list({ date }), [date]);
  const units = useAsync(() => consoles.list({}), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const codeOf = (consoleId: string) => units.data?.items.find((u) => u.id === consoleId)?.code ?? '—';
  const all = list.data?.items ?? [];
  const expired = all.filter((b) => effectiveBookingStatus(b) === 'expired');

  const rows = all
    .filter((b) => {
      if (tab === 'all') return true;
      if (tab === 'expired') return effectiveBookingStatus(b) === 'expired';
      return b.status === tab;
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const showTimeline = isDesktop && view === 'jadwal';

  function changeView(next: string) {
    setView(next as BookingView);
    localStorage.setItem(VIEW_KEY, next);
  }

  /** Both the table row and a timeline block open the one booking modal. */
  function openBooking(b: Booking) {
    setDraft({
      id: b.id,
      customerName: b.customerName,
      customerContact: b.customerContact ?? '',
      startTime: b.startTime,
      durationMinutes: String(b.durationMinutes),
      discount: b.discount ? String(b.discount) : '',
      notes: b.notes ?? '',
    });
  }

  function setDate(next: string) {
    setParams({ date: next }, { replace: true });
  }

  async function handleCheckIn(b: Booking) {
    setBusyId(b.id);
    try {
      const { session } = await bookings.checkIn(b.id);
      success(`Check-in ${b.customerName} berhasil.`);
      navigate(`/sesi/${session.id}`);
    } catch (e) {
      toastError(errorCode(e) === 'UNIT_OCCUPIED' ? 'Konsol sedang dipakai sesi lain.' : errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  /** Expired confirmed slots have no check-in; close them out instead. */
  async function handleComplete(b: Booking) {
    setBusyId(b.id);
    try {
      await bookings.update(b.id, { status: 'completed' });
      success('Booking ditandai selesai.');
      void list.reload();
    } catch (e) {
      toastError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(reason: string) {
    if (!cancelTarget) return;
    try {
      await bookings.cancel(cancelTarget.id, reason);
      success('Booking dibatalkan.');
      setCancelTarget(null);
      void list.reload();
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  async function saveDraft() {
    if (!draft) return;
    try {
      await bookings.update(draft.id, {
        customerName: draft.customerName,
        customerContact: draft.customerContact || null,
        startTime: draft.startTime,
        durationMinutes: Number(draft.durationMinutes) || 60,
        discount: draft.discount ? Number(draft.discount) : null,
        notes: draft.notes || null,
      } as Partial<Booking>);
      success('Booking diperbarui.');
      setDraft(null);
      void list.reload();
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  const columns: Column<Booking>[] = [
    {
      key: 'customer',
      header: 'Pelanggan',
      primary: true,
      render: (b) => b.customerName,
    },
    {
      // The unit is the operator's first question — it sits in the card's
      // top-right slot on mobile, in its own column on the laptop.
      key: 'console',
      header: 'Konsol',
      prominentOnMobile: true,
      render: (b) => (
        <span className="flex items-center gap-1.5">
          <Gamepad2 className="size-4 text-text-muted" aria-hidden="true" />
          {codeOf(b.consoleId)}
        </span>
      ),
    },
    { key: 'time', header: 'Mulai', render: (b) => b.startTime },
    {
      key: 'status',
      header: 'Status',
      render: (b) => <StatusBadge value={effectiveBookingStatus(b)} map={EFFECTIVE_BOOKING_STATUS} />,
    },
    { key: 'duration', header: 'Durasi', numeric: true, hideOnMobile: true, render: (b) => formatDurationShort(b.durationMinutes) },
    { key: 'discount', header: 'Diskon', numeric: true, hideOnMobile: true, render: (b) => (b.discount ? formatIDR(b.discount) : '—') },
  ];

  const isActionable = (b: Booking) => ['pending', 'confirmed', 'expired'].includes(effectiveBookingStatus(b));

  return (
    <div>
      <PageHeader
        title="Booking"
        subtitle="Jadwal pemesanan konsol."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="hidden md:block">
              <Tabs
                items={[{ value: 'jadwal', label: 'Jadwal' }, { value: 'daftar', label: 'Daftar' }]}
                value={view}
                onChange={changeView}
                variant="pill"
              />
            </div>
            <Button iconLeft={<CalendarPlus className="size-4" aria-hidden="true" />} onClick={() => navigate(`/booking/baru?date=${date}`)}>
              Booking baru
            </Button>
          </div>
        }
      />

      <PageSection>
        <div className="flex items-center gap-2">
          <IconButton icon={<ChevronLeft className="size-5" aria-hidden="true" />} label="Hari sebelumnya" onClick={() => setDate(shiftDate(date, -1))} />
          <div className="min-w-0 flex-1">
            <Input
              label="Tanggal"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || today())}
            />
          </div>
          <IconButton icon={<ChevronRight className="size-5" aria-hidden="true" />} label="Hari berikutnya" onClick={() => setDate(shiftDate(date, 1))} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant={date === today() ? 'primary' : 'secondary'} onClick={() => setDate(today())}>Hari ini</Button>
          <Button size="sm" variant="secondary" onClick={() => setDate(shiftDate(today(), 1))}>Besok</Button>
        </div>
      </PageSection>

      {expired.length > 0 && (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-[var(--radius-lg)] border border-danger/50 bg-danger-soft px-4 py-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger-text" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-body-sm text-text">
              {expired.length} booking kedaluwarsa pada tanggal ini. Tandai selesai atau batalkan.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setTab('expired');
                success(`Menampilkan ${expired.length} booking kedaluwarsa.`);
              }}
            >
              Tampilkan
            </Button>
          </div>
        </div>
      )}

      <PageSection>
        <Tabs items={TABS} value={tab} onChange={setTab} />
      </PageSection>

      {showTimeline ? (
        <PageSection
          title="Jadwal"
          description={`Jadwal unit pada ${formatJakarta(`${date}T00:00:00+07:00`, 'date')}.`}
        >
          <BookingTimeline
            consoles={units.data?.items ?? []}
            bookings={rows}
            loading={list.loading || units.loading}
            error={list.error ?? units.error}
            onSelect={openBooking}
            onRetry={() => { void list.reload(); void units.reload(); }}
            onAddUnit={() => navigate('/unit')}
          />
        </PageSection>
      ) : (
        <PageSection title="Daftar" description="Urut sesuai jam mulai.">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(b) => b.id}
            loading={list.loading}
            error={list.error}
            onRowClick={openBooking}
            rowLabel={(b) => b.customerName}
            empty={
              <EmptyState
                icon={<CalendarX className="size-8" aria-hidden="true" />}
                title="Tidak ada booking"
                description="Belum ada pemesanan pada filter ini."
                primaryAction={<Button onClick={() => navigate(`/booking/baru?date=${date}`)}>Booking baru</Button>}
              />
            }
            rowActions={(b) => (isActionable(b) ? (
              effectiveBookingStatus(b) === 'expired' ? (
                <>
                  <Button
                    size="sm"
                    loading={busyId === b.id}
                    iconLeft={<CircleCheck className="size-4" aria-hidden="true" />}
                    onClick={() => void handleComplete(b)}
                  >
                    Selesaikan
                  </Button>
                  <IconButton size="sm" tone="danger" icon={<X className="size-4" aria-hidden="true" />} label="Batalkan booking" onClick={() => setCancelTarget(b)} />
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    loading={busyId === b.id}
                    iconLeft={<LogIn className="size-4" aria-hidden="true" />}
                    onClick={() => void handleCheckIn(b)}
                  >
                    Check-in
                  </Button>
                  {isAdmin && (
                    <IconButton size="sm" icon={<Pencil className="size-4" aria-hidden="true" />} label="Ubah booking" onClick={() => openBooking(b)} />
                  )}
                  <IconButton size="sm" tone="danger" icon={<X className="size-4" aria-hidden="true" />} label="Batalkan booking" onClick={() => setCancelTarget(b)} />
                </>
              )
            ) : null)}
          />
          <p className="mt-2 text-caption text-text-muted sm:hidden">
            Jadwal harian per unit tersedia di layar ≥ 768 px.
          </p>
        </PageSection>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-text-secondary">
            Total {rows.length} booking pada {date}.
          </p>
          <Button variant="secondary" onClick={() => navigate(`/booking/baru?date=${date}`)}>Booking baru</Button>
        </div>
      </Card>

      <Modal
        open={draft !== null}
        onOpenChange={(v) => !v && setDraft(null)}
        title="Ubah booking"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>Batal</Button>
            <Button onClick={saveDraft} disabled={!draft?.customerName.trim()}>Simpan</Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <Input label="Nama pelanggan" value={draft.customerName} onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} maxLength={80} requiredMark />
            <Input label="Kontak" value={draft.customerContact} onChange={(e) => setDraft({ ...draft, customerContact: e.target.value })} inputMode="tel" maxLength={30} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Jam mulai" type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
              <Input label="Durasi (menit)" inputMode="numeric" value={draft.durationMinutes} onChange={(e) => setDraft({ ...draft, durationMinutes: e.target.value.replace(/[^\d]/g, '') })} />
            </div>
            {isAdmin && (
              <Input label="Diskon" inputMode="numeric" prefix="Rp" value={draft.discount} onChange={(e) => setDraft({ ...draft, discount: e.target.value.replace(/[^\d]/g, '') })} />
            )}
            <Textarea label="Catatan" rows={2} maxLength={200} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(v) => !v && setCancelTarget(null)}
        title="Batalkan booking?"
        description={cancelTarget ? `Booking atas nama ${cancelTarget.customerName} akan dibatalkan.` : undefined}
        confirmLabel="Batalkan booking"
        tone="destructive"
        reason={{ label: 'Alasan pembatalan', placeholder: 'mis. pelanggan tidak datang' }}
        onConfirm={handleCancel}
      />
    </div>
  );
}
