import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarPlus, CalendarX, Gamepad2, X } from 'lucide-react';
import { PageHeader, PageSection, StickyActionBar } from '../components/AppShell';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { EmptyState } from '../components/Feedback';
import { Input, Select } from '../components/Form';
import { ConfirmDialog, Modal } from '../components/Modal';
import { bookings, consoles, settings } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDurationShort, formatIDR, formatJakarta, toJakartaDateStr } from '../lib/format';
import { estimateCost } from '../lib/pricing';
import { EFFECTIVE_BOOKING_STATUS, effectiveBookingStatus } from '../lib/status';
import { useToast } from '../lib/toast';
import { errorCode, errorMessage, useAsync } from '../lib/useAsync';
import type { Booking } from '../lib/types';

const DURATION_CHIPS = [60, 90, 120, 180];

interface Draft {
  consoleId: string;
  customerName: string;
  customerContact: string;
  bookingDate: string;
  startTime: string;
  durationMinutes: string;
}

/** A customer may still withdraw a slot that has not started. */
function canCancel(b: Booking): boolean {
  return ['pending', 'confirmed'].includes(effectiveBookingStatus(b));
}

export function BookingSaya() {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const [params, setParams] = useSearchParams();

  const list = useAsync(() => bookings.list(), []);
  const units = useAsync(() => consoles.listPublic(), []);
  const cfg = useAsync(() => settings.getPublic(), []);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);

  const unitOf = (consoleId: string) => units.data?.items.find((u) => u.id === consoleId);
  const codeOf = (consoleId: string) => unitOf(consoleId)?.code ?? '—';
  const rounding = cfg.data?.rules.roundingMinutes ?? 15;
  const minMinutes = cfg.data?.rules.minDurationMinutes ?? 30;
  // The server binds the owner to the session, so a customer may not rename
  // the booking (DS-010 m10).
  const isCustomer = user?.role === 'user';

  // "Buat booking" from the home screen lands here with ?buat=1.
  useEffect(() => {
    if (!params.get('buat') || !user) return;
    setParams({}, { replace: true });
    setDraft({
      consoleId: '',
      customerName: user.fullName,
      customerContact: user.phone ?? '',
      bookingDate: toJakartaDateStr(),
      startTime: '19:00',
      durationMinutes: String(minMinutes),
    });
  }, [params, setParams, user, minMinutes]);

  // The real minimum only arrives with the settings. A draft opened before that
  // keeps the placeholder 30 and contradicts the "Minimal 60 menit." message
  // (DS-010 m9) — correct it once the truth is known.
  useEffect(() => {
    setDraft((d) => (d && Number(d.durationMinutes) < minMinutes
      ? { ...d, durationMinutes: String(minMinutes) }
      : d));
  }, [minMinutes]);

  function openForm() {
    setDraft({
      consoleId: '',
      customerName: user?.fullName ?? '',
      customerContact: user?.phone ?? '',
      bookingDate: toJakartaDateStr(),
      startTime: '19:00',
      durationMinutes: String(minMinutes),
    });
  }

  async function submit() {
    if (!draft) return;
    const minutes = Number(draft.durationMinutes);
    if (!draft.consoleId || draft.customerName.trim().length < 2 || !Number.isFinite(minutes) || minutes < minMinutes) return;
    setBusy(true);
    try {
      await bookings.create({
        consoleId: draft.consoleId,
        customerName: draft.customerName.trim(),
        customerContact: draft.customerContact.trim() || undefined,
        bookingDate: draft.bookingDate,
        startTime: draft.startTime,
        durationMinutes: minutes,
      });
      success('Booking berhasil dibuat. Booking menunggu konfirmasi admin.');
      setDraft(null);
      void list.reload();
    } catch (e) {
      toastError(errorCode(e) === 'BOOKING_CONFLICT' ? 'Unit sudah dipesan pada jam itu. Pilih jam lain.' : errorMessage(e));
    } finally {
      setBusy(false);
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

  const columns: Column<Booking>[] = [
    {
      key: 'date',
      header: 'Tanggal',
      primary: true,
      text: (b) => `Booking ${formatJakarta(`${b.bookingDate}T00:00:00+07:00`, 'date')} ${b.startTime}`,
      render: (b) => (
        <span>
          {formatJakarta(`${b.bookingDate}T00:00:00+07:00`, 'date')}
          <span className="sm:hidden"> · {b.startTime}</span>
        </span>
      ),
    },
    { key: 'time', header: 'Waktu', hideOnMobile: true, render: (b) => b.startTime },
    { key: 'duration', header: 'Durasi', numeric: true, render: (b) => formatDurationShort(b.durationMinutes) },
    {
      key: 'console',
      header: 'Unit',
      render: (b) => (
        <span className="flex items-center gap-1.5">
          <Gamepad2 className="size-4 text-text-muted" aria-hidden="true" />
          {codeOf(b.consoleId)}
        </span>
      ),
    },
    {
      key: 'estimate',
      header: 'Estimasi',
      numeric: true,
      prominentOnMobile: true,
      render: (b) => {
        const unit = unitOf(b.consoleId);
        if (!unit) return '—';
        return formatIDR(estimateCost(b.durationMinutes, unit.hourlyRate, rounding));
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (b) => <StatusBadge value={effectiveBookingStatus(b)} map={EFFECTIVE_BOOKING_STATUS} />,
    },
  ];

  const rows = list.data?.items ?? [];
  const unitOptions = (units.data?.items ?? []).map((u) => ({
    value: u.id,
    label: `${u.code} · ${u.consoleType} ${u.roomType} · ${formatIDR(u.hourlyRate)}/jam`,
  }));

  return (
    <div>
      <PageHeader
        title="Booking Saya"
        subtitle="Riwayat dan jadwal booking Anda."
      />

      <PageSection>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(b) => b.id}
          loading={list.loading}
          error={list.error}
          rowLabel={(b) => `Booking ${formatJakarta(`${b.bookingDate}T00:00:00+07:00`, 'date')} ${b.startTime}`}
          empty={
            <EmptyState
              icon={<CalendarX className="size-8" aria-hidden="true" />}
              title="Belum ada booking"
              description="Buat booking pertama Anda dan pilih unit yang tersedia."
              primaryAction={<Button onClick={openForm}>Buat booking</Button>}
            />
          }
          rowActions={(b) => (canCancel(b) ? (
            <Button
              size="sm"
              variant="danger"
              iconLeft={<X className="size-4" aria-hidden="true" />}
              onClick={() => setCancelTarget(b)}
            >
              Batalkan
            </Button>
          ) : null)}
        />
        <p className="mt-2 text-caption text-text-muted">
          Estimasi memakai tarif unit dan pembulatan durasi. Biaya final dihitung server saat check-in.
        </p>
      </PageSection>

      {/* The primary action stays reachable while the table is long (DS-010 M6).
          The spacer keeps the last row clear of the fixed bar. An empty table
          keeps the CTA of the empty state only — two "Buat booking" buttons in
          one screen read as a mistake (DS-011 M-D). */}
      {rows.length > 0 && <div className="h-[4.5rem] lg:hidden" aria-hidden="true" />}
      <StickyActionBar visible={rows.length > 0}>
        <Button iconLeft={<CalendarPlus className="size-4" aria-hidden="true" />} onClick={openForm}>
          Buat booking
        </Button>
      </StickyActionBar>

      <Modal
        open={draft !== null}
        onOpenChange={(v) => !v && setDraft(null)}
        title="Buat booking"
        description="Booking baru berstatus menunggu konfirmasi admin."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>Batal</Button>
            <Button
              onClick={() => void submit()}
              loading={busy}
              loadingText="Mengirim…"
              disabled={
                !draft?.consoleId
                || (draft?.customerName.trim().length ?? 0) < 2
                || (Number(draft?.durationMinutes) || 0) < minMinutes
              }
            >
              Kirim booking
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <p className="text-caption text-text-muted">* wajib diisi</p>
            <Select
              label="Unit"
              options={unitOptions}
              value={draft.consoleId}
              onChange={(e) => setDraft({ ...draft, consoleId: e.target.value })}
              placeholder="Pilih unit"
              requiredMark
            />
            <Input
              label="Tanggal"
              type="date"
              min={toJakartaDateStr()}
              value={draft.bookingDate}
              onChange={(e) => setDraft({ ...draft, bookingDate: e.target.value })}
              requiredMark
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Jam mulai"
                type="time"
                value={draft.startTime}
                onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                requiredMark
              />
              <Input
                label="Durasi (menit)"
                inputMode="numeric"
                value={draft.durationMinutes}
                onChange={(e) => setDraft({ ...draft, durationMinutes: e.target.value.replace(/[^\d]/g, '') })}
                helpText={`Minimal ${minMinutes} menit.`}
                error={Number(draft.durationMinutes) > 0 && Number(draft.durationMinutes) < minMinutes ? `Minimal ${minMinutes} menit.` : undefined}
                requiredMark
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {DURATION_CHIPS.map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={Number(draft.durationMinutes) === m ? 'primary' : 'secondary'}
                  onClick={() => setDraft({ ...draft, durationMinutes: String(m) })}
                >
                  {formatDurationShort(m)}
                </Button>
              ))}
            </div>
            <Input
              label={isCustomer ? 'Nama pemesan' : 'Nama pelanggan'}
              value={draft.customerName}
              onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
              readOnly={isCustomer}
              maxLength={60}
              helpText={isCustomer ? 'Diambil dari akun Anda.' : undefined}
              requiredMark
            />
            <Input
              label="Kontak"
              type="tel"
              inputMode="tel"
              value={draft.customerContact}
              onChange={(e) => setDraft({ ...draft, customerContact: e.target.value })}
              maxLength={40}
              helpText="Opsional. Nomor yang bisa dihubungi."
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(v) => !v && setCancelTarget(null)}
        title="Batalkan booking?"
        description={cancelTarget ? `Booking tanggal ${formatJakarta(`${cancelTarget.bookingDate}T00:00:00+07:00`, 'date')} pukul ${cancelTarget.startTime} akan dibatalkan.` : undefined}
        confirmLabel="Batalkan booking"
        tone="destructive"
        reason={{ label: 'Alasan pembatalan', placeholder: 'mis. jadwal berubah', optional: true }}
        onConfirm={handleCancel}
      />
    </div>
  );
}
